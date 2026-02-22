import Phaser from 'phaser'

/**
 * Register a subset of the mutant_ripped multi-atlas animations
 * for use in the dream scene.
 *
 * Frame naming in the atlas uses dashes and flat numbering:
 *   Idle: prefix "mutant-unarmed-idle-" with frames 0-95
 *   Walk: prefix "mutant-unarmed-walk-" with frames 0-59
 *
 * Direction mapping (matches CharacterAnims.ts overrides):
 *   Idle (16 frames each): up_right=0-15, right=16-31, down_right=32-47,
 *                           down=48-63, left=64-79, up_left=80-95
 *   Walk (10 frames each): up_right=0-9, right=10-19, down_right=20-29,
 *                           down=30-39, left=40-49, up_left=50-59
 *
 * Aliases: up = up_left, down_left = down
 *
 * Uses `mutant_idle_*` and `mutant_walk_*` keys for dream mode
 * (the 2D client uses `mutant_run_*` for walk — we alias both).
 */

const ATLAS_KEY = 'mutant_ripped'
const IDLE_PREFIX = 'mutant-unarmed-idle-'
const WALK_PREFIX = 'mutant-unarmed-walk-'

const IDLE_FRAME_RATE = 9
const WALK_FRAME_RATE = 10

// Direction → idle frame range (start, end inclusive)
const IDLE_RANGES: Record<string, [number, number]> = {
  up_right: [0, 15],
  right: [16, 31],
  down_right: [32, 47],
  down: [48, 63],
  down_left: [48, 63], // alias of down
  left: [64, 79],
  up_left: [80, 95],
  up: [80, 95], // alias of up_left
}

// Direction → walk frame range (start, end inclusive)
const WALK_RANGES: Record<string, [number, number]> = {
  up_right: [0, 9],
  right: [10, 19],
  down_right: [20, 29],
  down: [30, 39],
  down_left: [30, 39], // alias of down
  left: [40, 49],
  up_left: [50, 59],
  up: [50, 59], // alias of up_left
}

export function registerDreamAnims(anims: Phaser.Animations.AnimationManager) {
  // Register idle animations
  for (const [dir, [start, end]] of Object.entries(IDLE_RANGES)) {
    const key = `mutant_idle_${dir}`
    if (anims.exists(key)) continue

    anims.create({
      key,
      frames: anims.generateFrameNames(ATLAS_KEY, {
        start,
        end,
        prefix: IDLE_PREFIX,
      }),
      repeat: -1,
      frameRate: IDLE_FRAME_RATE,
    })
  }

  // Register walk animations (mutant_walk_*)
  for (const [dir, [start, end]] of Object.entries(WALK_RANGES)) {
    const key = `mutant_walk_${dir}`
    if (anims.exists(key)) continue

    anims.create({
      key,
      frames: anims.generateFrameNames(ATLAS_KEY, {
        start,
        end,
        prefix: WALK_PREFIX,
      }),
      repeat: -1,
      frameRate: WALK_FRAME_RATE,
    })
  }
}
