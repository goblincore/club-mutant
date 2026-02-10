import * as THREE from 'three'

import type { ManifestAnimation, ManifestTrack } from './CharacterLoader'

// Sample a single track at a given time
export function sampleTrack(
  keys: [number, number][],
  time: number,
  duration: number,
  interpolation: 'linear' | 'step'
): number {
  if (keys.length === 0) return 0

  const loopedTime = time % duration

  let prev = keys[0]!
  let next = keys[0]!

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!

    if (k[0] <= loopedTime) {
      prev = k
      next = i + 1 < keys.length ? keys[i + 1]! : keys[0]!
    }
  }

  if (interpolation === 'step') {
    return prev[1]
  }

  const segDuration = next[0] > prev[0] ? next[0] - prev[0] : duration - prev[0] + next[0]

  if (segDuration === 0) return prev[1]

  const t = (loopedTime - prev[0]) / segDuration

  return prev[1] + (next[1] - prev[1]) * Math.max(0, Math.min(1, t))
}

// Apply a full animation clip to a map of bone groups
export function applyAnimation(
  anim: ManifestAnimation,
  boneMap: Map<string, THREE.Group>,
  time: number,
  PX_SCALE: number
) {
  for (const track of anim.tracks) {
    const bone = boneMap.get(track.boneId)

    if (!bone) continue

    const value = sampleTrack(track.keys, time, anim.duration, anim.interpolation)

    applyTrackValue(bone, track, value, PX_SCALE)
  }
}

function applyTrackValue(bone: THREE.Group, track: ManifestTrack, value: number, PX_SCALE: number) {
  switch (track.property) {
    case 'rotation.x':
      bone.rotation.x = value
      break
    case 'rotation.y':
      bone.rotation.y = value
      break
    case 'rotation.z':
      bone.rotation.z = value
      break
    case 'position.x':
      bone.position.x = (bone.userData.baseX ?? 0) + value * PX_SCALE
      break
    case 'position.y':
      bone.position.y = (bone.userData.baseY ?? 0) - value * PX_SCALE
      break
    case 'position.z':
      bone.position.z = (bone.userData.baseZ ?? 0) + value * PX_SCALE
      break
  }
}

// Reset all bones to their base positions
export function resetBones(boneMap: Map<string, THREE.Group>) {
  boneMap.forEach((bone) => {
    bone.rotation.set(0, 0, 0)

    bone.position.set(
      bone.userData.baseX ?? bone.position.x,
      bone.userData.baseY ?? bone.position.y,
      bone.userData.baseZ ?? bone.position.z
    )
  })
}
