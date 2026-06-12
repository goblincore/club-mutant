import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, getPlayerPosition } from '../stores/gameStore'

const WORLD_SCALE = 0.01
const FADE_SPEED = 6
const OCCLUDE_OPACITY = 0.08

// Module-level scratch objects (single player, single frame — no concurrency)
const raycaster = new THREE.Raycaster()
const playerWorldPos = new THREE.Vector3()
const _scratchDir = new THREE.Vector3()

/**
 * Fades any wall blocking the camera's view of the local player.
 * Expects the caller to attach the returned refs to 4 wall meshes
 * (indices 0..3) and 4 attachment groups.
 *
 * Each frame:
 *   1. Raycasts from camera → local player.
 *   2. Any wall between them fades to OCCLUDE_OPACITY (via uOpacity uniform
 *      on ShaderMaterial or .opacity on MeshStandardMaterial).
 *   3. All descendants of the corresponding attachment group fade too,
 *      with emissive intensity scaled down proportionally so neon signs
 *      don't pop through faded walls.
 */
export function useWallOcclusion(wallCount: number = 4) {
  const { camera } = useThree()

  const wallRefs = useRef<THREE.Mesh[]>([])
  const wallOpacities = useRef<number[]>(Array(wallCount).fill(1))
  const wallAttachmentRefs = useRef<(THREE.Group | null)[]>(Array(wallCount).fill(null))

  const setWallRef = (index: number) => (mesh: THREE.Mesh | null) => {
    if (mesh) wallRefs.current[index] = mesh
  }
  const setWallAttachmentRef = (index: number) => (group: THREE.Group | null) => {
    wallAttachmentRefs.current[index] = group
  }

  useFrame((_, delta) => {
    const myId = useGameStore.getState().mySessionId
    if (!myId) return
    const pos = getPlayerPosition(myId)
    if (!pos) return

    playerWorldPos.set(pos.x * WORLD_SCALE, 0.5, -pos.y * WORLD_SCALE)

    const dir = _scratchDir.copy(playerWorldPos).sub(camera.position).normalize()
    raycaster.set(camera.position, dir)
    const distToPlayer = camera.position.distanceTo(playerWorldPos)

    for (let i = 0; i < wallRefs.current.length; i++) {
      const wall = wallRefs.current[i]
      if (!wall) continue

      const mat = wall.material as THREE.ShaderMaterial | THREE.MeshStandardMaterial

      // Temporarily use DoubleSide for raycasting so backface hits (camera
      // outside room) register correctly.
      const prevSide = (mat as THREE.Material).side
      ;(mat as THREE.Material).side = THREE.DoubleSide
      const isBlocking = raycaster
        .intersectObject(wall)
        .some((hit) => hit.distance < distToPlayer)
      ;(mat as THREE.Material).side = prevSide

      const targetOpacity = isBlocking ? OCCLUDE_OPACITY : 1
      const t = 1 - Math.exp(-FADE_SPEED * delta)
      wallOpacities.current[i] += (targetOpacity - wallOpacities.current[i]) * t

      const opacity = wallOpacities.current[i]
      const faded = opacity < 0.99

      // Update wall material opacity + depthWrite
      if ('uniforms' in mat && mat.uniforms.uOpacity) {
        const sm = mat as THREE.ShaderMaterial
        sm.uniforms.uOpacity.value = opacity
        sm.depthWrite = !faded
      } else {
        const msm = mat as THREE.MeshStandardMaterial
        msm.opacity = opacity
        msm.depthWrite = !faded
      }

      // Fade wall-mounted objects (posters, TV, neon signs, etc.) to match.
      const attachments = wallAttachmentRefs.current[i]
      if (attachments) {
        attachments.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const m = child.material as any
            // Handle ShaderMaterial (e.g., AudioReactiveVideoMaterial) via uOpacity uniform
            if (m.uniforms?.uOpacity) {
              m.uniforms.uOpacity.value = opacity
              m.depthWrite = !faded
              m.side = faded ? THREE.DoubleSide : THREE.FrontSide
              return
            }
            if (!m.transparent) {
              m.transparent = true
              m.needsUpdate = true
            }
            m.opacity = opacity
            m.depthWrite = !faded
            m.side = faded ? THREE.DoubleSide : THREE.FrontSide
            // Scale emissive intensity so neon signs etc. fade with the wall
            if (typeof m.emissiveIntensity === 'number') {
              if (m.userData._baseEmissive === undefined) {
                m.userData._baseEmissive = m.emissiveIntensity
              }
              m.emissiveIntensity = m.userData._baseEmissive * opacity
            }
          }
        })
      }
    }
  })

  return { setWallRef, setWallAttachmentRef }
}
