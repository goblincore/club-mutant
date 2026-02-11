import type { AnimationClip } from './types'

// Preset animations that work with a standard humanoid skeleton:
// torso, head, arm_l, arm_r, leg_l, leg_r

export const PRESET_ANIMATIONS: AnimationClip[] = [
  {
    name: 'idle',
    fps: 10,
    duration: 2.0,
    interpolation: 'linear',
    tracks: [
      {
        boneId: 'torso',
        property: 'rotation.z',
        keys: [
          [0, 0],
          [1.0, 0.02],
          [2.0, 0],
        ],
      },
      {
        boneId: 'head',
        property: 'rotation.z',
        keys: [
          [0, 0],
          [1.0, -0.03],
          [2.0, 0],
        ],
      },
      {
        boneId: 'arm_l',
        property: 'rotation.z',
        keys: [
          [0, 0.05],
          [1.0, -0.02],
          [2.0, 0.05],
        ],
      },
      {
        boneId: 'arm_r',
        property: 'rotation.z',
        keys: [
          [0, -0.05],
          [1.0, 0.02],
          [2.0, -0.05],
        ],
      },
    ],
  },

  {
    name: 'wave',
    fps: 12,
    duration: 1.0,
    interpolation: 'linear',
    tracks: [
      {
        boneId: 'arm_r',
        property: 'rotation.z',
        keys: [
          [0, 0.3],
          [0.25, 1.2],
          [0.5, 0.8],
          [0.75, 1.2],
          [1.0, 0.3],
        ],
      },
      {
        boneId: 'torso',
        property: 'rotation.z',
        keys: [
          [0, 0],
          [0.5, 0.05],
          [1.0, 0],
        ],
      },
    ],
  },

  {
    name: 'walk',
    fps: 12,
    duration: 0.8,
    interpolation: 'linear',
    tracks: [
      {
        boneId: 'torso',
        property: 'rotation.z',
        keys: [
          [0, -0.04],
          [0.4, 0.04],
          [0.8, -0.04],
        ],
      },
      {
        boneId: 'arm_l',
        property: 'rotation.z',
        keys: [
          [0, 0.4],
          [0.4, -0.4],
          [0.8, 0.4],
        ],
      },
      {
        boneId: 'arm_r',
        property: 'rotation.z',
        keys: [
          [0, -0.4],
          [0.4, 0.4],
          [0.8, -0.4],
        ],
      },
      {
        boneId: 'leg_l',
        property: 'rotation.z',
        keys: [
          [0, -0.3],
          [0.4, 0.3],
          [0.8, -0.3],
        ],
      },
      {
        boneId: 'leg_r',
        property: 'rotation.z',
        keys: [
          [0, 0.3],
          [0.4, -0.3],
          [0.8, 0.3],
        ],
      },
    ],
  },

  {
    name: 'dance',
    fps: 12,
    duration: 1.2,
    interpolation: 'step',
    tracks: [
      {
        boneId: 'torso',
        property: 'position.y',
        keys: [
          [0, 0],
          [0.3, 10],
          [0.6, 0],
          [0.9, 10],
          [1.2, 0],
        ],
      },
      {
        boneId: 'torso',
        property: 'rotation.z',
        keys: [
          [0, -0.1],
          [0.3, 0.1],
          [0.6, -0.1],
          [0.9, 0.1],
          [1.2, -0.1],
        ],
      },
      {
        boneId: 'arm_l',
        property: 'rotation.z',
        keys: [
          [0, 0.8],
          [0.3, -1.2],
          [0.6, 0.8],
          [0.9, -1.2],
          [1.2, 0.8],
        ],
      },
      {
        boneId: 'arm_l',
        property: 'rotation.y',
        keys: [
          [0, 0],
          [0.3, 0.6],
          [0.6, 0],
          [0.9, -0.5],
          [1.2, 0],
        ],
      },
      {
        boneId: 'arm_r',
        property: 'rotation.z',
        keys: [
          [0, -1.2],
          [0.3, 0.8],
          [0.6, -1.2],
          [0.9, 0.8],
          [1.2, -1.2],
        ],
      },
      {
        boneId: 'arm_r',
        property: 'rotation.y',
        keys: [
          [0, 0],
          [0.3, -0.5],
          [0.6, 0],
          [0.9, 0.6],
          [1.2, 0],
        ],
      },
      {
        boneId: 'leg_l',
        property: 'rotation.z',
        keys: [
          [0, 0.2],
          [0.3, -0.2],
          [0.6, 0.2],
          [0.9, -0.2],
          [1.2, 0.2],
        ],
      },
      {
        boneId: 'leg_r',
        property: 'rotation.z',
        keys: [
          [0, -0.2],
          [0.3, 0.2],
          [0.6, -0.2],
          [0.9, 0.2],
          [1.2, -0.2],
        ],
      },
    ],
  },
]
