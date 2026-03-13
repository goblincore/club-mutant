import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { PaperDoll } from '../character/PaperDoll'
import { WearableOverlay } from '../character/WearableOverlay'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore } from '../stores/authStore'
import { saveWearables, getWearables } from '../network/nakamaClient'
import type { WearableSlot, WearableConfig, BoneRole } from '@club-mutant/types/Wearables'

const PLACEHOLDER_ITEM = 'party-hat'
const BONE_ROLES: BoneRole[] = ['head', 'torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r']

const labelClass = 'text-white/30 text-[10px] uppercase tracking-wider'
const btnClass =
  'py-1.5 px-3 rounded-lg text-xs font-mono border transition-all duration-200'

/** Inner R3F scene for wearable preview + drag interaction */
function EditorScene({
  characterPath,
  slot,
  onDrag,
  onLayout,
}: {
  characterPath: string
  slot: WearableSlot
  onDrag: (offsetX: number, offsetY: number) => void
  onLayout: (layout: { visualTopY: number }) => void
}) {
  const { camera, gl } = useThree()
  const isDragging = useRef(false)
  const targetY = useRef(0.55)
  const lastDragWorld = useRef<THREE.Vector3 | null>(null)

  const handleLayout = useCallback(
    (layout: { worldHeight: number; headTopY: number; visualTopY: number }) => {
      targetY.current = layout.visualTopY / 2
      onLayout({ visualTopY: layout.visualTopY })
    },
    [onLayout]
  )

  useFrame(() => {
    const cy = camera.position.y
    const ty = targetY.current
    if (Math.abs(cy - ty) > 0.001) {
      const newY = cy + (ty - cy) * 0.15
      camera.position.y = newY
      camera.lookAt(0, newY, 0)
      camera.updateProjectionMatrix()
    }
  })

  useEffect(() => {
    camera.position.set(0, 0.55, 5)
    camera.lookAt(0, 0.55, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  // Convert screen position to world-space position (orthographic)
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1
      return new THREE.Vector3(ndcX, ndcY, 0).unproject(camera)
    },
    [camera, gl]
  )

  // Drag handling — moves offset by world-space delta
  useEffect(() => {
    const canvas = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      isDragging.current = true
      canvas.setPointerCapture(e.pointerId)
      lastDragWorld.current = screenToWorld(e.clientX, e.clientY)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current || !lastDragWorld.current) return
      const world = screenToWorld(e.clientX, e.clientY)
      const dx = world.x - lastDragWorld.current.x
      const dy = world.y - lastDragWorld.current.y
      lastDragWorld.current = world
      onDrag(dx, dy)
    }

    const onPointerUp = () => {
      isDragging.current = false
      lastDragWorld.current = null
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerUp)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerUp)
    }
  }, [gl, onDrag, screenToWorld])

  // Build boneChildren so the wearable is rendered attached to the bone
  const boneChildren = useMemo(() => {
    const bone = slot.attachBone || 'head'
    return {
      [bone]: <WearableOverlay slot={slot} />,
    }
  }, [slot])

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[2, 5, 3]} intensity={0.5} />
      <PaperDoll
        characterPath={characterPath}
        animationName="idle"
        onLayout={handleLayout}
        boneChildren={boneChildren}
      />
    </>
  )
}

interface WearableEditorProps {
  onClose: () => void
}

export function WearableEditor({ onClose }: WearableEditorProps) {
  const characterPath = useGameStore((s) => s.selectedCharacterPath)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [slot, setSlot] = useState<WearableSlot>({
    itemId: PLACEHOLDER_ITEM,
    attachBone: 'head',
    offsetX: 0,
    offsetY: 0.15, // slightly above head bone pivot
    scale: 1,
    zIndex: 10,
  })
  const [hasWearable, setHasWearable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Load existing wearable config
  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }
    let cancelled = false
    getWearables()
      .then((config) => {
        if (cancelled) return
        if (config.slots?.length > 0) {
          const loaded = config.slots[0]
          // Ensure attachBone is set (backcompat with old data)
          if (!loaded.attachBone) loaded.attachBone = 'head'
          setSlot(loaded)
          setHasWearable(true)
        } else {
          setHasWearable(false)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load wearables')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [isAuthenticated])

  // Drag handler — receives world-space delta, converts to bone-local offset delta.
  // PaperDoll applies charScale to the root group, so world delta needs to be
  // divided by charScale to get bone-local delta. We approximate charScale ≈ 1
  // for the editor preview since the canvas zoom already handles visual scale.
  const handleDrag = useCallback((dx: number, dy: number) => {
    setSlot((prev) => ({
      ...prev,
      offsetX: Math.round((prev.offsetX + dx) * 100) / 100,
      offsetY: Math.round((prev.offsetY + dy) * 100) / 100,
    }))
  }, [])

  const handleLayout = useCallback(() => {}, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const config: WearableConfig = hasWearable ? { slots: [slot] } : { slots: [] }
      await saveWearables(config)
      setSuccess(true)
      setTimeout(onClose, 600)
    } catch (err: any) {
      setError(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="w-80 h-full shrink-0 overflow-y-auto border-l font-mono flex flex-col gap-3 p-4"
      style={{
        backgroundColor: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(16px)',
        borderColor: 'rgba(57,255,20,0.3)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-white/70 text-xs font-bold uppercase tracking-wider">
          wearables
        </span>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white text-base transition-colors"
        >
          x
        </button>
      </div>

      {loading ? (
        <p className="text-white/25 text-xs text-center py-4">loading...</p>
      ) : (
        <>
          {/* Toggle wearable on/off */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasWearable}
              onChange={(e) => setHasWearable(e.target.checked)}
              className="accent-[#39ff14]"
            />
            <span className="text-white/50 text-xs">
              equip wearable
            </span>
          </label>

          {hasWearable && (
            <>
              {/* Bone selector */}
              <div className="flex flex-col gap-1">
                <label className={labelClass}>attach to</label>
                <div className="flex flex-wrap gap-1">
                  {BONE_ROLES.map((bone) => (
                    <button
                      key={bone}
                      onClick={() =>
                        setSlot((prev) => ({
                          ...prev,
                          attachBone: bone,
                          offsetX: 0,
                          offsetY: bone === 'head' ? 0.15 : 0,
                        }))
                      }
                      className={btnClass}
                      style={{
                        borderColor:
                          slot.attachBone === bone
                            ? 'rgba(57,255,20,0.6)'
                            : 'rgba(255,255,255,0.15)',
                        color: slot.attachBone === bone ? '#39ff14' : 'rgba(255,255,255,0.5)',
                        backgroundColor:
                          slot.attachBone === bone ? 'rgba(57,255,20,0.12)' : 'transparent',
                        fontSize: '9px',
                        padding: '4px 8px',
                      }}
                    >
                      {bone.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview canvas — drag to position */}
              <div className="flex flex-col gap-1">
                <label className={labelClass}>drag to position</label>
                <div
                  className="rounded-lg overflow-hidden border"
                  style={{
                    height: 280,
                    borderColor: 'rgba(57,255,20,0.3)',
                    cursor: 'crosshair',
                  }}
                >
                  <Canvas
                    orthographic
                    camera={{
                      position: [0, 0.55, 5],
                      zoom: 170,
                      near: 0.1,
                      far: 100,
                    }}
                    dpr={1}
                    gl={{ alpha: true, antialias: false }}
                    style={{ background: 'transparent' }}
                    onCreated={({ gl }) => {
                      gl.setClearColor(0x000000, 0)
                    }}
                  >
                    <EditorScene
                      characterPath={characterPath}
                      slot={slot}
                      onDrag={handleDrag}
                      onLayout={handleLayout}
                    />
                  </Canvas>
                </div>
              </div>

              {/* Position readout */}
              <div className="flex gap-3 text-[10px] text-white/25">
                <span>
                  x: {slot.offsetX.toFixed(2)}
                </span>
                <span>
                  y: {slot.offsetY.toFixed(2)}
                </span>
              </div>

              {/* Scale slider */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className={labelClass}>scale</label>
                  <span className="text-white/25 text-[10px]">
                    {slot.scale.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="2"
                  step="0.1"
                  value={slot.scale}
                  onChange={(e) =>
                    setSlot((prev) => ({
                      ...prev,
                      scale: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-[#39ff14]"
                />
              </div>

              {/* Z-index toggle */}
              <div className="flex flex-col gap-1">
                <label className={labelClass}>layer</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSlot((prev) => ({ ...prev, zIndex: 10 }))}
                    className={btnClass}
                    style={{
                      borderColor:
                        slot.zIndex > 0
                          ? 'rgba(57,255,20,0.6)'
                          : 'rgba(255,255,255,0.15)',
                      color: slot.zIndex > 0 ? '#39ff14' : 'rgba(255,255,255,0.5)',
                      backgroundColor:
                        slot.zIndex > 0 ? 'rgba(57,255,20,0.12)' : 'transparent',
                    }}
                  >
                    in front
                  </button>
                  <button
                    onClick={() =>
                      setSlot((prev) => ({ ...prev, zIndex: -10 }))
                    }
                    className={btnClass}
                    style={{
                      borderColor:
                        slot.zIndex < 0
                          ? 'rgba(57,255,20,0.6)'
                          : 'rgba(255,255,255,0.15)',
                      color: slot.zIndex < 0 ? '#39ff14' : 'rgba(255,255,255,0.5)',
                      backgroundColor:
                        slot.zIndex < 0 ? 'rgba(57,255,20,0.12)' : 'transparent',
                    }}
                  >
                    behind
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Error / Success */}
          {error && (
            <p className="text-xs font-mono text-center" style={{ color: '#ff0080' }}>
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs font-mono text-center" style={{ color: '#39ff14' }}>
              saved!
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-xs font-mono border transition-colors"
              style={{
                borderColor: 'rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              cancel
            </button>
            {isAuthenticated ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-lg text-xs font-mono font-bold border transition-all duration-200"
                style={{
                  borderColor: 'rgba(57,255,20,0.4)',
                  color: '#39ff14',
                  backgroundColor: 'rgba(57,255,20,0.12)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.25)'
                  e.currentTarget.style.boxShadow = '0 0 15px rgba(57,255,20,0.3)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(57,255,20,0.12)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {saving ? 'saving...' : 'save'}
              </button>
            ) : (
              <p className="flex-1 text-[10px] text-white/25 text-center self-center">
                sign in to save
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
