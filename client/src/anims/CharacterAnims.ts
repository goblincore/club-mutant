import Phaser from 'phaser'

import { createMutantRippedAnims } from './MutantRippedAnims'

export const createCharacterAnims = (anims: Phaser.Animations.AnimationManager) => {
  const animsFrameRate = 10

  anims.create({
    key: 'nancy_idle_right',
    frames: anims.generateFrameNames('nancy', {
      start: 0,
      end: 5,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'nancy_idle_up',
    frames: anims.generateFrameNames('nancy', {
      start: 6,
      end: 11,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'nancy_idle_left',
    frames: anims.generateFrameNames('nancy', {
      start: 12,
      end: 17,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'nancy_idle_down',
    frames: anims.generateFrameNames('nancy', {
      start: 18,
      end: 23,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'nancy_run_right',
    frames: anims.generateFrameNames('nancy', {
      start: 24,
      end: 29,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'nancy_run_up',
    frames: anims.generateFrameNames('nancy', {
      start: 30,
      end: 35,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'nancy_run_left',
    frames: anims.generateFrameNames('nancy', {
      start: 36,
      end: 41,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'nancy_run_down',
    frames: anims.generateFrameNames('nancy', {
      start: 42,
      end: 47,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'nancy_sit_down',
    frames: anims.generateFrameNames('nancy', {
      start: 48,
      end: 48,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'nancy_sit_left',
    frames: anims.generateFrameNames('nancy', {
      start: 49,
      end: 49,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'nancy_sit_right',
    frames: anims.generateFrameNames('nancy', {
      start: 50,
      end: 50,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'nancy_sit_up',
    frames: anims.generateFrameNames('nancy', {
      start: 51,
      end: 51,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'lucy_idle_right',
    frames: anims.generateFrameNames('lucy', {
      start: 8,
      end: 8,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'lucy_idle_up',
    frames: anims.generateFrameNames('lucy', {
      start: 3,
      end: 5,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'lucy_idle_left',
    frames: anims.generateFrameNames('lucy', {
      start: 6,
      end: 6,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'lucy_idle_down',
    frames: anims.generateFrameNames('lucy', {
      start: 0,
      end: 2,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'lucy_run_right',
    frames: anims.generateFrameNames('lucy', {
      start: 8,
      end: 9,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'lucy_run_up',
    frames: anims.generateFrameNames('lucy', {
      start: 3,
      end: 5,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'lucy_run_left',
    frames: anims.generateFrameNames('lucy', {
      start: 6,
      end: 7,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'lucy_run_down',
    frames: anims.generateFrameNames('lucy', {
      start: 0,
      end: 2,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'lucy_sit_down',
    frames: anims.generateFrameNames('lucy', {
      start: 0,
      end: 0,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'lucy_sit_left',
    frames: anims.generateFrameNames('lucy', {
      start: 6,
      end: 6,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'lucy_sit_right',
    frames: anims.generateFrameNames('lucy', {
      start: 9,
      end: 9,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'lucy_sit_up',
    frames: anims.generateFrameNames('lucy', {
      start: 4,
      end: 4,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'ash_idle_right',
    frames: anims.generateFrameNames('ash', {
      start: 0,
      end: 5,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'ash_idle_up',
    frames: anims.generateFrameNames('ash', {
      start: 6,
      end: 11,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'ash_idle_left',
    frames: anims.generateFrameNames('ash', {
      start: 12,
      end: 17,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'ash_idle_down',
    frames: anims.generateFrameNames('ash', {
      start: 18,
      end: 23,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'ash_run_right',
    frames: anims.generateFrameNames('ash', {
      start: 24,
      end: 29,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'ash_run_up',
    frames: anims.generateFrameNames('ash', {
      start: 30,
      end: 35,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'ash_run_left',
    frames: anims.generateFrameNames('ash', {
      start: 36,
      end: 41,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'ash_run_down',
    frames: anims.generateFrameNames('ash', {
      start: 42,
      end: 47,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'ash_sit_down',
    frames: anims.generateFrameNames('ash', {
      start: 48,
      end: 48,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'ash_sit_left',
    frames: anims.generateFrameNames('ash', {
      start: 49,
      end: 49,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'ash_sit_right',
    frames: anims.generateFrameNames('ash', {
      start: 50,
      end: 50,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'ash_sit_up',
    frames: anims.generateFrameNames('ash', {
      start: 51,
      end: 51,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'adam_idle_right',
    frames: anims.generateFrameNames('adam', {
      start: 16,
      end: 31,
      prefix: 'mutant-idle-',
      suffix: '.png',
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'adam_idle_up',
    frames: anims.generateFrameNames('adam', {
      start: 80,
      end: 95,
      prefix: 'mutant-idle-',
      suffix: '.png',
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'adam_idle_left',
    frames: anims.generateFrameNames('adam', {
      start: 64,
      end: 79,
      prefix: 'mutant-idle-',
      suffix: '.png',
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'adam_idle_down',
    frames: anims.generateFrameNames('adam', {
      start: 48,
      end: 63,
      prefix: 'mutant-idle-',
      suffix: '.png',
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'adam_run_right',
    frames: anims.generateFrameNames('adam', {
      start: 10,
      end: 19,
      prefix: 'mutant-walk-',
      suffix: '.png',
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'adam_run_up',
    frames: anims.generateFrameNames('adam', {
      start: 50,
      end: 59,
      prefix: 'mutant-walk-',
      suffix: '.png',
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'adam_run_left',
    frames: anims.generateFrameNames('adam', {
      start: 40,
      end: 49,
      prefix: 'mutant-walk-',
      suffix: '.png',
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'adam_run_down',
    frames: anims.generateFrameNames('adam', {
      start: 20,
      end: 29,
      prefix: 'mutant-walk-',
      suffix: '.png',
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'adam_sit_down',
    frames: anims.generateFrameNames('adam', {
      start: 48,
      end: 48,
      prefix: 'mutant-idle-',
      suffix: '.png',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'adam_sit_left',
    frames: anims.generateFrameNames('adam', {
      start: 49,
      end: 49,
      prefix: 'mutant-idle-',
      suffix: '.png',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'adam_sit_right',
    frames: anims.generateFrameNames('adam', {
      start: 50,
      end: 50,
      prefix: 'mutant-idle-',
      suffix: '.png',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'adam_sit_up',
    frames: anims.generateFrameNames('adam', {
      start: 51,
      end: 51,
      prefix: 'mutant-idle-',
      suffix: '.png',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_boombox',
    frames: anims.generateFrameNumbers('mutant_boombox', {
      start: 0,
      end: 11,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.5,
  })

  anims.create({
    key: 'mutant_djwip',
    frames: anims.generateFrameNumbers('mutant_djwip', {
      start: 0,
      end: 4,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.25,
  })

  anims.create({
    key: 'mutant_transform',
    frames: anims.generateFrameNumbers('mutant_transform', {
      start: 0,
      end: 5,
    }),
    repeat: 0,
    frameRate: animsFrameRate * 0.5,
  })

  anims.create({
    key: 'mutant_transform_reverse',
    frames: anims
      .generateFrameNumbers('mutant_transform', {
        start: 0,
        end: 5,
      })
      .reverse(),
    repeat: 0,
    frameRate: animsFrameRate * 0.5,
  })

  // Mutant atlas animations (new spritesheet)
  // mut_idle: 96 frames, 16 per direction (6 isometric directions)
  // Order: NE(0-15), E(16-31), SE(32-47), S(48-63), SW(64-79), W(80-95)
  anims.create({
    key: 'mutant_idle_up_right',
    frames: anims.generateFrameNames('mutant', {
      start: 0,
      end: 15,
      prefix: 'mut_idle-',
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'mutant_idle_right',
    frames: anims.generateFrameNames('mutant', {
      start: 16,
      end: 31,
      prefix: 'mut_idle-',
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'mutant_idle_down_right',
    frames: anims.generateFrameNames('mutant', {
      start: 32,
      end: 47,
      prefix: 'mut_idle-',
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'mutant_idle_down',
    frames: anims.generateFrameNames('mutant', {
      start: 48,
      end: 63,
      prefix: 'mut_idle-',
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'mutant_idle_down_left',
    frames: anims.generateFrameNames('mutant', {
      start: 48,
      end: 63,
      prefix: 'mut_idle-',
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'mutant_idle_left',
    frames: anims.generateFrameNames('mutant', {
      start: 64,
      end: 79,
      prefix: 'mut_idle-',
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  anims.create({
    key: 'mutant_idle_up_left',
    frames: anims.generateFrameNames('mutant', {
      start: 80,
      end: 95,
      prefix: 'mut_idle-',
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  })

  // mut_walk: 60 frames, 10 per direction (6 isometric directions)
  // Order: NE(0-9), E(10-19), SE(20-29), SW(30-39), W(40-49), NW(50-59)
  anims.create({
    key: 'mutant_run_up_right',
    frames: anims.generateFrameNames('mutant', {
      start: 0,
      end: 9,
      prefix: 'mut_walk-',
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_run_right',
    frames: anims.generateFrameNames('mutant', {
      start: 10,
      end: 19,
      prefix: 'mut_walk-',
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_run_down_right',
    frames: anims.generateFrameNames('mutant', {
      start: 20,
      end: 29,
      prefix: 'mut_walk-',
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_run_down',
    frames: anims.generateFrameNames('mutant', {
      start: 30,
      end: 39,
      prefix: 'mut_walk-',
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_run_down_left',
    frames: anims.generateFrameNames('mutant', {
      start: 30,
      end: 39,
      prefix: 'mut_walk-',
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_run_left',
    frames: anims.generateFrameNames('mutant', {
      start: 40,
      end: 49,
      prefix: 'mut_walk-',
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_run_up_left',
    frames: anims.generateFrameNames('mutant', {
      start: 50,
      end: 59,
      prefix: 'mut_walk-',
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  })

  // mut_punch: 66 frames, 11 per direction (6 isometric directions)
  // Order: NE(0-10), E(11-21), SE(22-32), S(33-43), SW(44-54), W(55-65)
  anims.create({
    key: 'mutant_punch_up',
    frames: anims.generateFrameNames('mutant', {
      start: 0,
      end: 10,
      prefix: 'mut_punch-',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_punch_up_right',
    frames: anims.generateFrameNames('mutant', {
      start: 0,
      end: 10,
      prefix: 'mut_punch-',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_punch_right',
    frames: anims.generateFrameNames('mutant', {
      start: 11,
      end: 21,
      prefix: 'mut_punch-',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_punch_down_right',
    frames: anims.generateFrameNames('mutant', {
      start: 22,
      end: 32,
      prefix: 'mut_punch-',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_punch_down',
    frames: anims.generateFrameNames('mutant', {
      start: 33,
      end: 43,
      prefix: 'mut_punch-',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_punch_down_left',
    frames: anims.generateFrameNames('mutant', {
      start: 33,
      end: 43,
      prefix: 'mut_punch-',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_punch_left',
    frames: anims.generateFrameNames('mutant', {
      start: 44,
      end: 54,
      prefix: 'mut_punch-',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  anims.create({
    key: 'mutant_punch_up_left',
    frames: anims.generateFrameNames('mutant', {
      start: 55,
      end: 65,
      prefix: 'mut_punch-',
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  })

  // mut_burn: non-contiguous frames split by direction (6 isometric directions)
  // Order: NE(up), E(right), SE(down_right), S(down), SW(down_left), W(left)
  const burnByDir = {
    up: [1, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    right: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
    down_right: [24, 25, 28, 29, 30, 31, 32, 33, 34, 35],
    down: [39, 40, 41, 42, 43, 44, 46],
    down_left: [50, 51, 52, 53, 54, 55, 56, 57, 58],
    left: [62, 63, 64, 66, 67, 68, 69, 70],
  }

  Object.entries(burnByDir).forEach(([dir, frames]) => {
    anims.create({
      key: `mutant_burn_${dir}`,
      frames: frames.map((n) => ({ key: 'mutant', frame: `mut_burn-${n}` })),
      repeat: 0,
      frameRate: animsFrameRate * 0.5,
    })
  })

  // mut_flamethrower: non-contiguous frames split by direction (6 isometric directions)
  // Order: NE(up), E(right), SE(down_right), S(down), SW(down_left), W(left)
  const flameByDir = {
    up: [1, 3, 6, 7, 10],
    right: [12, 14, 16, 17, 18],
    down_right: [37, 38, 39, 41, 42],
    down: [47, 48, 49, 50, 51],
    down_left: [56, 58, 59, 60, 61],
    left: [84, 88, 89, 90, 93],
  }

  Object.entries(flameByDir).forEach(([dir, frames]) => {
    anims.create({
      key: `mutant_flamethrower_${dir}`,
      frames: frames.map((n) => ({ key: 'mutant', frame: `mut_flamethrower-${n}` })),
      repeat: 0,
      frameRate: animsFrameRate * 0.5,
    })
  })

  createMutantRippedAnims(anims)

  const overrideLoop = (
    key: string,
    prefix: string,
    start: number,
    end: number,
    frameRate: number
  ) => {
    if (anims.exists(key)) {
      anims.remove(key)
    }

    anims.create({
      key,
      frames: anims.generateFrameNames('mutant_ripped', {
        start,
        end,
        prefix,
      }),
      repeat: -1,
      frameRate,
    })
  }

  const overrideNoLoop = (
    key: string,
    prefix: string,
    start: number,
    end: number,
    frameRate: number
  ) => {
    if (anims.exists(key)) {
      anims.remove(key)
    }

    anims.create({
      key,
      frames: anims.generateFrameNames('mutant_ripped', {
        start,
        end,
        prefix,
      }),
      repeat: 0,
      frameRate,
    })
  }

  const idlePrefix = 'mutant-unarmed-idle-'
  const walkPrefix = 'mutant-unarmed-walk-'

  overrideLoop('mutant_idle_up_right', idlePrefix, 0, 15, 9)
  overrideLoop('mutant_idle_right', idlePrefix, 16, 31, 9)
  overrideLoop('mutant_idle_down_right', idlePrefix, 32, 47, 9)
  overrideLoop('mutant_idle_down', idlePrefix, 48, 63, 9)
  overrideLoop('mutant_idle_down_left', idlePrefix, 48, 63, 9)
  overrideLoop('mutant_idle_left', idlePrefix, 64, 79, 9)
  overrideLoop('mutant_idle_up_left', idlePrefix, 80, 95, 9)

  overrideLoop('mutant_run_up_right', walkPrefix, 0, 9, animsFrameRate)
  overrideLoop('mutant_run_right', walkPrefix, 10, 19, animsFrameRate)
  overrideLoop('mutant_run_down_right', walkPrefix, 20, 29, animsFrameRate)
  overrideLoop('mutant_run_down', walkPrefix, 30, 39, animsFrameRate)
  overrideLoop('mutant_run_down_left', walkPrefix, 30, 39, animsFrameRate)
  overrideLoop('mutant_run_left', walkPrefix, 40, 49, animsFrameRate)
  overrideLoop('mutant_run_up_left', walkPrefix, 50, 59, animsFrameRate)

  // Unarmed Punch Override
  const punchFrameRate = animsFrameRate * 1.6
  overrideNoLoop('mutant_punch_up_right', 'mutant-unarmed-punch-', 0, 10, punchFrameRate)
  overrideNoLoop('mutant_punch_right', 'mutant-unarmed-punch-', 11, 21, punchFrameRate)
  overrideNoLoop('mutant_punch_down_right', 'mutant-unarmed-punch-', 22, 32, punchFrameRate)
  overrideNoLoop('mutant_punch_down', 'mutant-unarmed-punch-', 33, 43, punchFrameRate)
  overrideNoLoop('mutant_punch_down_left', 'mutant-unarmed-punch-', 33, 43, punchFrameRate)
  overrideNoLoop('mutant_punch_left', 'mutant-unarmed-punch-', 44, 54, punchFrameRate)
  overrideNoLoop('mutant_punch_up_left', 'mutant-unarmed-punch-', 55, 65, punchFrameRate)
  overrideNoLoop('mutant_punch_up', 'mutant-unarmed-punch-', 55, 65, punchFrameRate)

  // Hit1 Override
  overrideNoLoop('mutant_hit1_up_right', 'mutant-unarmed-hit1-', 0, 5, animsFrameRate)
  overrideNoLoop('mutant_hit1_right', 'mutant-unarmed-hit1-', 6, 11, animsFrameRate)
  overrideNoLoop('mutant_hit1_down_right', 'mutant-unarmed-hit1-', 12, 17, animsFrameRate)
  overrideNoLoop('mutant_hit1_down', 'mutant-unarmed-hit1-', 18, 23, animsFrameRate)
  overrideNoLoop('mutant_hit1_down_left', 'mutant-unarmed-hit1-', 18, 23, animsFrameRate)
  overrideNoLoop('mutant_hit1_left', 'mutant-unarmed-hit1-', 24, 29, animsFrameRate)
  overrideNoLoop('mutant_hit1_up_left', 'mutant-unarmed-hit1-', 30, 35, animsFrameRate)
  overrideNoLoop('mutant_hit1_up', 'mutant-unarmed-hit1-', 30, 35, animsFrameRate)

  // Hit2 Override
  overrideNoLoop('mutant_hit2_up_right', 'mutant-unarmed-hit2-', 0, 5, animsFrameRate)
  overrideNoLoop('mutant_hit2_right', 'mutant-unarmed-hit2-', 6, 11, animsFrameRate)
  overrideNoLoop('mutant_hit2_down_right', 'mutant-unarmed-hit2-', 12, 17, animsFrameRate)
  overrideNoLoop('mutant_hit2_down', 'mutant-unarmed-hit2-', 18, 23, animsFrameRate)
  overrideNoLoop('mutant_hit2_down_left', 'mutant-unarmed-hit2-', 18, 23, animsFrameRate)
  overrideNoLoop('mutant_hit2_left', 'mutant-unarmed-hit2-', 24, 29, animsFrameRate)
  overrideNoLoop('mutant_hit2_up_left', 'mutant-unarmed-hit2-', 30, 35, animsFrameRate)
  overrideNoLoop('mutant_hit2_up', 'mutant-unarmed-hit2-', 30, 35, animsFrameRate)
}
