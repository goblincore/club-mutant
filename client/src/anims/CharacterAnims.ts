import Phaser from 'phaser'

export const createCharacterAnims = (anims: Phaser.Animations.AnimationManager) => {
  const animsFrameRate = 15

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
    key: 'adam_boombox',
    frames: anims.generateFrameNumbers('adam_boombox', {
      start: 0,
      end: 11,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.5,
  })

  anims.create({
    key: 'adam_djwip',
    frames: anims.generateFrameNumbers('adam_djwip', {
      start: 0,
      end: 4,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.25,
  })

  anims.create({
    key: 'adam_transform',
    frames: anims.generateFrameNumbers('adam_transform', {
      start: 0,
      end: 5,
    }),
    repeat: 0,
    frameRate: animsFrameRate * 0.5,
  })

  anims.create({
    key: 'adam_transform_reverse',
    frames: anims
      .generateFrameNumbers('adam_transform', {
        start: 0,
        end: 5,
      })
      .reverse(),
    repeat: 0,
    frameRate: animsFrameRate * 0.5,
  })
}
