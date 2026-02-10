// A single body part in the character rig
export interface CharacterPart {
  id: string
  textureUrl: string // object URL or asset path
  textureWidth: number
  textureHeight: number

  // Normalized pivot point (0-1) — the joint/rotation origin
  pivot: [number, number]

  // Parent part id (null = root)
  parentId: string | null

  // Local offset from parent's pivot, in pixels
  offset: [number, number, number]

  // Render order for z-layering (higher = in front)
  zIndex: number

  // Bone role for animation mapping (e.g. 'torso', 'head', 'arm_l')
  boneRole: string | null
}

// Standard humanoid bone roles that preset animations target
export const BONE_ROLES = ['torso', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r'] as const

export type BoneRole = (typeof BONE_ROLES)[number]

// A fully assembled character rig
export interface CharacterRig {
  name: string
  parts: CharacterPart[]
}

// Animation keyframe: [time, value]
export type Keyframe = [number, number]

// A single animation track targeting one bone property
export interface AnimationTrack {
  boneId: string
  property: 'rotation.x' | 'rotation.y' | 'rotation.z' | 'position.x' | 'position.y' | 'position.z'
  keys: Keyframe[]
}

// A complete animation clip
export interface AnimationClip {
  name: string
  fps: number
  duration: number // seconds
  interpolation: 'linear' | 'step'
  tracks: AnimationTrack[]
}

// Editor tool modes
export type EditorTool = 'select' | 'pivot' | 'offset'

// Character manifest for export
export interface CharacterManifest {
  name: string
  parts: Array<{
    id: string
    texture: string
    pivot: [number, number]
    size: [number, number]
    parent: string | null
    offset: [number, number, number]
    zIndex: number
    boneRole: string | null
  }>
  animations: AnimationClip[]
}
