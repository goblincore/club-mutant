import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

import {
  useChatStore,
  BUBBLE_DURATION,
  type ChatBubble as ChatBubbleData,
} from '../stores/chatStore'

const TALL_THRESHOLD = 1.2
const BUBBLE_PAD_X = 0.035
const BUBBLE_PAD_Y = 0.025
const BUBBLE_RADIUS = 0.03

const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

// Tail triangle (points -Y by default)
const tailGeo = (() => {
  const s = new THREE.Shape()
  s.moveTo(-0.012, 0)
  s.lineTo(0.012, 0)
  s.lineTo(0, -0.025)
  s.closePath()
  return new THREE.ShapeGeometry(s)
})()

function makeRoundedRect(w: number, h: number, r: number): THREE.ShapeGeometry {
  r = Math.min(r, w / 2, h / 2)
  const shape = new THREE.Shape()
  const hw = w / 2
  const hh = h / 2

  shape.moveTo(-hw + r, -hh)
  shape.lineTo(hw - r, -hh)
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r)
  shape.lineTo(hw, hh - r)
  shape.quadraticCurveTo(hw, hh, hw - r, hh)
  shape.lineTo(-hw + r, hh)
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r)
  shape.lineTo(-hw, -hh + r)
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh)

  return new THREE.ShapeGeometry(shape)
}

function bubbleTextSize(len: number): number {
  if (len <= 8) return 0.09
  if (len <= 20) return 0.076
  return 0.064
}

const STACK_GAP = 0.04 // gap between bubbles (on top of measured height)
const FADE_MS = 400

// ── Bubble image constants + texture cache (LRU, max 20) ──

const IMAGE_SQUARE = 0.4 // fixed square size in world units (bigger, chunky)
const IMAGE_BORDER_PAD = 0.02
const IMAGE_GAP = 0.03
const MAX_TEX_CACHE = 20

const _texLoader = new THREE.TextureLoader()
const _texCache = new Map<string, THREE.Texture>()
const _texLRU: string[] = []

function loadBubbleTexture(url: string, onLoad: (tex: THREE.Texture) => void) {
  const cached = _texCache.get(url)
  if (cached) {
    const idx = _texLRU.indexOf(url)
    if (idx >= 0) _texLRU.splice(idx, 1)
    _texLRU.push(url)
    onLoad(cached)
    return
  }
  _texLoader.load(url, (tex) => {
    tex.minFilter = THREE.NearestFilter
    tex.magFilter = THREE.NearestFilter
    tex.colorSpace = THREE.SRGBColorSpace

    // Cover-crop to square: center the image and crop the longer edge
    const img = tex.image as { width: number; height: number } | undefined
    if (img) {
      const aspect = img.width / img.height
      if (aspect > 1) {
        // Wider than tall — crop sides
        tex.repeat.set(1 / aspect, 1)
        tex.offset.set((1 - 1 / aspect) / 2, 0)
      } else if (aspect < 1) {
        // Taller than wide — crop top/bottom
        tex.repeat.set(1, aspect)
        tex.offset.set(0, (1 - aspect) / 2)
      }
    }

    _texCache.set(url, tex)
    _texLRU.push(url)
    while (_texLRU.length > MAX_TEX_CACHE) {
      const evictUrl = _texLRU.shift()!
      const evictTex = _texCache.get(evictUrl)
      if (evictTex) evictTex.dispose()
      _texCache.delete(evictUrl)
    }
    onLoad(tex)
  })
}

// ── Single bubble in the stack ──

function SingleBubble({
  bubble,
  yOffset,
  showTail,
  useSide,
  flipLeft,
  onHeightMeasured,
}: {
  bubble: ChatBubbleData
  yOffset: number
  showTail: boolean
  useSide: boolean
  flipLeft: boolean
  onHeightMeasured?: (id: string, height: number) => void
}) {
  const bgRef = useRef<THREE.Mesh>(null)
  const tailRef = useRef<THREE.Mesh>(null)
  const textRef = useRef<any>(null)
  const groupRef = useRef<THREE.Group>(null)
  const animRef = useRef(0)
  const bgBounds = useRef({ cx: 0, cy: 0, w: 0.1, h: 0.1 })
  // Per-bubble material clone so opacity doesn't affect other bubbles
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null)
  if (!matRef.current) {
    matRef.current = bubbleMat.clone()
    matRef.current.transparent = true
  }

  const hasText = bubble.content.trim().length > 0
  const hasImage = !!bubble.imageUrl

  // ── Image texture loading ──
  const [imgTex, setImgTex] = useState<THREE.Texture | null>(null)
  const imgGroupRef = useRef<THREE.Group>(null)
  const imgBorderRef = useRef<THREE.Mesh>(null)
  const imgPlaneRef = useRef<THREE.Mesh>(null)
  const imgMatRef = useRef<THREE.MeshBasicMaterial | null>(null)
  const imgBorderMatRef = useRef<THREE.MeshBasicMaterial | null>(null)

  // Lazy material creation for image (synchronous, so they're ready for first render)
  if (hasImage && !imgMatRef.current) {
    imgMatRef.current = new THREE.MeshBasicMaterial({ transparent: true })
  }
  if (hasImage && !imgBorderMatRef.current) {
    imgBorderMatRef.current = bubbleMat.clone()
    imgBorderMatRef.current.transparent = true
  }

  // Fixed square dimensions (cover-crop is handled by texture UV)
  const imgDims = useMemo(() => {
    if (!imgTex?.image) return null
    return { w: IMAGE_SQUARE, h: IMAGE_SQUARE }
  }, [imgTex])

  // Sync texture to material
  if (imgMatRef.current && imgTex && imgMatRef.current.map !== imgTex) {
    imgMatRef.current.map = imgTex
    imgMatRef.current.needsUpdate = true
  }

  // Load image texture
  useEffect(() => {
    if (!bubble.imageUrl) return
    loadBubbleTexture(bubble.imageUrl, setImgTex)
  }, [bubble.imageUrl])

  // Layer setup + cleanup
  useEffect(() => {
    bgRef.current?.layers.set(1)
    tailRef.current?.layers.set(1)
    return () => {
      matRef.current?.dispose()
      imgMatRef.current?.dispose()
      imgBorderMatRef.current?.dispose()
    }
  }, [])

  // Layer setup for image meshes (fires when imgDims appear)
  useEffect(() => {
    if (imgDims) {
      imgBorderRef.current?.layers.set(1)
      imgPlaneRef.current?.layers.set(1)
    }
  }, [imgDims])

  // Report height for image-only bubbles (no text → handleSync won't fire)
  useEffect(() => {
    if (!hasText && imgDims) {
      // Image square + border
      onHeightMeasured?.(bubble.id, imgDims.h + IMAGE_BORDER_PAD * 2)
    }
  }, [hasText, imgDims, bubble.id, onHeightMeasured])

  useFrame((_, delta) => {
    if (!groupRef.current) return

    // Pop-in
    if (animRef.current < 1) {
      animRef.current = Math.min(1, animRef.current + delta * 8)
    }

    // Shrink-out + fade-out in last FADE_MS
    const remaining = BUBBLE_DURATION - (Date.now() - bubble.timestamp)
    const fadeT = remaining < FADE_MS ? Math.max(0, remaining / FADE_MS) : 1
    const fadeScale = 0.7 + 0.3 * fadeT // scale shrinks to 0.7 (not 0)

    const ease = 1 - (1 - animRef.current) * (1 - animRef.current)
    groupRef.current.scale.setScalar(ease * (animRef.current < 1 ? 1 : fadeScale))

    // Opacity fade (text + image)
    if (matRef.current) matRef.current.opacity = fadeT
    if (textRef.current) textRef.current.fillOpacity = fadeT
    if (imgMatRef.current) imgMatRef.current.opacity = fadeT
    if (imgBorderMatRef.current) imgBorderMatRef.current.opacity = fadeT

    // Position image group ABOVE text (or at origin for image-only)
    if (imgGroupRef.current && imgDims) {
      if (hasText) {
        const { cy, h } = bgBounds.current
        // Image sits above the text bubble
        imgGroupRef.current.position.y = cy + h / 2 + IMAGE_GAP + imgDims.h / 2 + IMAGE_BORDER_PAD
      } else {
        imgGroupRef.current.position.y = 0
      }
    }

    // Tail position — always below the lowest element
    if (tailRef.current) {
      const { cx, cy, w, h } = bgBounds.current

      if (useSide) {
        tailRef.current.rotation.z = flipLeft ? -Math.PI / 2 : Math.PI / 2
        if (hasText) {
          tailRef.current.position.set(flipLeft ? cx + w / 2 : cx - w / 2, cy, 0)
        } else if (imgDims) {
          const halfW = imgDims.w / 2 + IMAGE_BORDER_PAD
          tailRef.current.position.set(flipLeft ? halfW : -halfW, 0, 0)
        }
      } else {
        tailRef.current.rotation.z = 0
        if (hasText) {
          // Tail below text (image is above)
          tailRef.current.position.set(cx, cy - h / 2, 0)
        } else if (imgDims) {
          // Image-only: tail below image border
          tailRef.current.position.set(0, -(imgDims.h / 2 + IMAGE_BORDER_PAD), 0)
        }
      }
    }
  })

  const handleSync = useCallback((troika: THREE.Mesh) => {
    troika.layers.set(1)

    troika.geometry.computeBoundingBox()
    const bb = troika.geometry.boundingBox
    if (!bb || !bgRef.current) return

    const w = bb.max.x - bb.min.x + BUBBLE_PAD_X * 2
    const h = bb.max.y - bb.min.y + BUBBLE_PAD_Y * 2
    const cx = (bb.min.x + bb.max.x) / 2
    const cy = (bb.min.y + bb.max.y) / 2

    bgBounds.current = { cx, cy, w, h }

    bgRef.current.geometry.dispose()
    bgRef.current.geometry = makeRoundedRect(w, h, BUBBLE_RADIUS)
    bgRef.current.position.set(cx, cy, -0.003)

    // Report combined height (text + optional image)
    let totalH = h
    if (imgDims) {
      totalH += IMAGE_GAP + imgDims.h + IMAGE_BORDER_PAD * 2
    }
    onHeightMeasured?.(bubble.id, totalH)
  }, [bubble.id, onHeightMeasured, imgDims])

  const fontSize = bubbleTextSize(bubble.content.length)

  return (
    <group ref={groupRef} position={[0, yOffset, 0]} scale={0}>
      {/* Text content (only if message has text) */}
      {hasText && (
        <>
          <Text
            ref={textRef}
            fontSize={fontSize}
            maxWidth={0.6}
            color="#000000"
            anchorX="center"
            anchorY="bottom"
            textAlign="center"
            font="/fonts/courier-prime.woff"
            onSync={handleSync}
          >
            {bubble.content}
          </Text>

          <mesh ref={bgRef} material={matRef.current!}>
            <planeGeometry args={[0.1, 0.1]} />
          </mesh>
        </>
      )}

      {/* Image plane — polaroid frame with NearestFilter for chunky PSX pixels */}
      {imgDims && imgMatRef.current && imgBorderMatRef.current && (
        <group ref={imgGroupRef}>
          {/* White border (polaroid frame) */}
          <mesh ref={imgBorderRef} material={imgBorderMatRef.current}>
            <planeGeometry args={[imgDims.w + IMAGE_BORDER_PAD * 2, imgDims.h + IMAGE_BORDER_PAD * 2]} />
          </mesh>
          {/* Image texture */}
          <mesh ref={imgPlaneRef} material={imgMatRef.current} position={[0, 0, 0.001]}>
            <planeGeometry args={[imgDims.w, imgDims.h]} />
          </mesh>
        </group>
      )}

      {showTail && <mesh ref={tailRef} geometry={tailGeo} material={matRef.current!} />}
    </group>
  )
}

// ── Stacked bubble container — handles positioning, distance scaling, flip ──

export function ChatBubble3D({
  sessionId,
  visualTopY,
  headTopY,
}: {
  sessionId: string
  visualTopY: number
  headTopY: number
}) {
  const bubbles = useChatStore((s) => s.bubbles.get(sessionId))
  const outerRef = useRef<THREE.Group>(null)
  const markerRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const [flipLeft, setFlipLeft] = useState(false)
  const tempVec = useRef(new THREE.Vector3())
  const frameCount = useRef(0)

  // Track measured heights per bubble id (ref-based, no re-renders)
  const bubbleHeights = useRef<Map<string, number>>(new Map())

  const handleHeightMeasured = useCallback((id: string, height: number) => {
    bubbleHeights.current.set(id, height)
  }, [])

  // Clean up stale entries when bubbles change
  useEffect(() => {
    if (!bubbles?.length) {
      bubbleHeights.current.clear()
      return
    }
    const activeIds = new Set(bubbles.map((b) => b.id))
    for (const key of bubbleHeights.current.keys()) {
      if (!activeIds.has(key)) bubbleHeights.current.delete(key)
    }
  }, [bubbles])

  const useSide = visualTopY > TALL_THRESHOLD

  // Enable layer 1 on camera so bubbles render when post-processing is off
  useEffect(() => {
    camera.layers.enable(1)
  }, [camera])

  // Distance scaling + screen-edge flip
  useFrame(() => {
    if (!outerRef.current || !markerRef.current || !bubbles?.length) return

    markerRef.current.getWorldPosition(tempVec.current)
    const dist = tempVec.current.distanceTo(camera.position)
    const targetScale = Math.max(0.8, Math.min(2.5, dist / 4))
    outerRef.current.scale.setScalar(targetScale)

    // Screen-edge flip for side bubbles (every 4th frame)
    if (useSide) {
      frameCount.current++

      if (frameCount.current % 4 === 0) {
        tempVec.current.project(camera)
        const shouldFlip = tempVec.current.x > 0.3
        if (shouldFlip !== flipLeft) setFlipLeft(shouldFlip)
      }
    }

    // Update bubble y-offsets based on measured heights
    const group = outerRef.current
    if (!group || !bubbles?.length) return
    let accY = 0
    for (let i = 0; i < bubbles.length; i++) {
      const child = group.children[i] as THREE.Group | undefined
      if (!child) continue
      child.position.y = accY
      const measuredH = bubbleHeights.current.get(bubbles[i].id)
      accY += (measuredH ?? 0.12) + STACK_GAP
    }
  })

  if (!bubbles?.length) return <group ref={markerRef} />

  const position: [number, number, number] = useSide
    ? [flipLeft ? -0.5 : 0.5, headTopY, 0]
    : [0, visualTopY + 0.15, 0]

  return (
    <>
      <group ref={markerRef} />

      <group ref={outerRef} position={position}>
        {bubbles.map((bubble, i) => (
          <SingleBubble
            key={bubble.id}
            bubble={bubble}
            yOffset={0}
            showTail={i === 0}
            useSide={useSide}
            flipLeft={flipLeft}
            onHeightMeasured={handleHeightMeasured}
          />
        ))}
      </group>
    </>
  )
}
