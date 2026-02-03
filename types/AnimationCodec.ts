export const TEXTURE_IDS = {
  mutant: 0,
  adam: 1,
  ash: 2,
  lucy: 3,
  nancy: 4,
} as const

export type TextureName = keyof typeof TEXTURE_IDS
export type TextureId = (typeof TEXTURE_IDS)[TextureName]

const textureNamesById: Record<number, TextureName> = {
  0: 'mutant',
  1: 'adam',
  2: 'ash',
  3: 'lucy',
  4: 'nancy',
}

export const DIR_IDS = {
  down: 0,
  down_left: 1,
  left: 2,
  up_left: 3,
  up: 4,
  up_right: 5,
  right: 6,
  down_right: 7,
} as const

export type AnimDir = keyof typeof DIR_IDS

const dirNamesById: Record<number, AnimDir> = {
  0: 'down',
  1: 'down_left',
  2: 'left',
  3: 'up_left',
  4: 'up',
  5: 'up_right',
  6: 'right',
  7: 'down_right',
}

const hasEightWayAnimsByTextureId: Record<number, boolean> = {
  [TEXTURE_IDS.mutant]: true,
  [TEXTURE_IDS.adam]: false,
  [TEXTURE_IDS.ash]: false,
  [TEXTURE_IDS.lucy]: false,
  [TEXTURE_IDS.nancy]: false,
}

const collapseDirForTexture = (textureId: number, dir: AnimDir): AnimDir => {
  if (hasEightWayAnimsByTextureId[textureId]) return dir

  if (dir === 'up_left' || dir === 'up_right') return 'up'
  if (dir === 'down_left' || dir === 'down_right') return 'down'

  return dir
}

export const ANIM_KIND_IDS = {
  idle: 0,
  run: 1,
  sit: 2,
} as const

export type AnimKind = keyof typeof ANIM_KIND_IDS

const SPECIAL_ANIM_IDS = {
  mutant_boombox: 24,
  mutant_djwip: 25,
  mutant_transform: 26,
  mutant_transform_reverse: 27,
} as const

const HIT1_BASE = 32
const HIT2_BASE = 40
const PUNCH_BASE = 48
const BURN_BASE = 56
const FLAMETHROWER_BASE = 64

type EncodedAnim = {
  textureId: number
  animId: number
}

export const sanitizeTextureId = (textureId: unknown): number => {
  if (typeof textureId !== 'number' || !Number.isFinite(textureId)) return TEXTURE_IDS.mutant

  const tid = Math.trunc(textureId)

  return textureNamesById[tid] ? tid : TEXTURE_IDS.mutant
}

export const sanitizeAnimId = (animId: unknown, textureId: number): number => {
  if (typeof animId !== 'number' || !Number.isFinite(animId)) {
    return packDirectionalAnimId('idle', 'down')
  }

  const aid = Math.trunc(animId)

  if (aid >= 0 && aid < 24) return aid

  if (textureId === TEXTURE_IDS.mutant && aid >= 24 && aid <= 27) return aid

  if (textureId === TEXTURE_IDS.mutant && aid >= HIT1_BASE && aid < HIT1_BASE + 8) return aid

  if (textureId === TEXTURE_IDS.mutant && aid >= HIT2_BASE && aid < HIT2_BASE + 8) return aid

  if (textureId === TEXTURE_IDS.mutant && aid >= PUNCH_BASE && aid < PUNCH_BASE + 8) return aid

  if (textureId === TEXTURE_IDS.mutant && aid >= BURN_BASE && aid < BURN_BASE + 8) return aid

  if (textureId === TEXTURE_IDS.mutant && aid >= FLAMETHROWER_BASE && aid < FLAMETHROWER_BASE + 8)
    return aid

  return packDirectionalAnimId('idle', 'down')
}

export const decodeTextureName = (textureId: number): TextureName => {
  return textureNamesById[textureId] ?? 'mutant'
}

export const encodeTextureName = (name: string): number => {
  const key = name as TextureName

  return TEXTURE_IDS[key] ?? TEXTURE_IDS.mutant
}

export const packDirectionalAnimId = (kind: AnimKind, dir: AnimDir): number => {
  const kindId = ANIM_KIND_IDS[kind]
  const dirId = DIR_IDS[dir]

  return (kindId << 3) | dirId
}

export const unpackDirectionalAnimId = (animId: number): { kind: AnimKind; dir: AnimDir } => {
  const kindId = (animId >> 3) & 0b11
  const dirId = animId & 0b111

  const kind = (Object.keys(ANIM_KIND_IDS) as AnimKind[]).find((k) => ANIM_KIND_IDS[k] === kindId)

  return {
    kind: kind ?? 'idle',
    dir: dirNamesById[dirId] ?? 'down',
  }
}

export const encodeAnimKey = (animKey: string): EncodedAnim => {
  if (animKey in SPECIAL_ANIM_IDS) {
    return {
      textureId: TEXTURE_IDS.mutant,
      animId: SPECIAL_ANIM_IDS[animKey as keyof typeof SPECIAL_ANIM_IDS],
    }
  }

  if (
    animKey.startsWith('mutant_hit1_') ||
    animKey.startsWith('mutant_hit2_') ||
    animKey.startsWith('mutant_punch_') ||
    animKey.startsWith('mutant_burn_') ||
    animKey.startsWith('mutant_flamethrower_')
  ) {
    const parts = animKey.split('_')
    const kindRaw = parts[1] ?? 'hit1'
    const dirRaw = parts.length >= 3 ? parts.slice(2).join('_') : 'down'
    const dirId = (DIR_IDS as Record<string, number>)[dirRaw]
    const safeDirId = typeof dirId === 'number' ? dirId : DIR_IDS.down

    let base = HIT1_BASE
    if (kindRaw === 'hit2') base = HIT2_BASE
    else if (kindRaw === 'punch') base = PUNCH_BASE
    else if (kindRaw === 'burn') base = BURN_BASE
    else if (kindRaw === 'flamethrower') base = FLAMETHROWER_BASE

    return {
      textureId: TEXTURE_IDS.mutant,
      animId: base + safeDirId,
    }
  }

  const parts = animKey.split('_')
  const texture = parts[0] ?? 'mutant'

  const textureId = encodeTextureName(texture)

  const kindRaw = parts[1] ?? 'idle'
  const kind: AnimKind =
    kindRaw === 'idle' || kindRaw === 'run' || kindRaw === 'sit'
      ? kindRaw
      : kindRaw === 'walk'
        ? 'run'
        : 'idle'

  const dirRaw = parts.length >= 3 ? parts.slice(2).join('_') : 'down'
  const parsedDir: AnimDir =
    (DIR_IDS as Record<string, number>)[dirRaw] !== undefined ? (dirRaw as AnimDir) : 'down'

  const dir = collapseDirForTexture(textureId, parsedDir)

  return {
    textureId,
    animId: packDirectionalAnimId(kind, dir),
  }
}

export const decodeAnimKey = (textureId: number, animId: number): string => {
  const textureName = decodeTextureName(textureId)

  if (textureId === TEXTURE_IDS.mutant) {
    if (animId >= HIT1_BASE && animId < HIT1_BASE + 8) {
      const dirId = animId - HIT1_BASE
      const dir = dirNamesById[dirId] ?? 'down'
      return `mutant_hit1_${dir}`
    }

    if (animId >= HIT2_BASE && animId < HIT2_BASE + 8) {
      const dirId = animId - HIT2_BASE
      const dir = dirNamesById[dirId] ?? 'down'
      return `mutant_hit2_${dir}`
    }

    if (animId >= PUNCH_BASE && animId < PUNCH_BASE + 8) {
      const dirId = animId - PUNCH_BASE
      const dir = dirNamesById[dirId] ?? 'down'
      return `mutant_punch_${dir}`
    }

    if (animId >= BURN_BASE && animId < BURN_BASE + 8) {
      const dirId = animId - BURN_BASE
      const dir = dirNamesById[dirId] ?? 'down'
      return `mutant_burn_${dir}`
    }

    if (animId >= FLAMETHROWER_BASE && animId < FLAMETHROWER_BASE + 8) {
      const dirId = animId - FLAMETHROWER_BASE
      const dir = dirNamesById[dirId] ?? 'down'
      return `mutant_flamethrower_${dir}`
    }

    const special = (Object.keys(SPECIAL_ANIM_IDS) as Array<keyof typeof SPECIAL_ANIM_IDS>).find(
      (k) => SPECIAL_ANIM_IDS[k] === animId
    )

    if (special) return special
  }

  const { kind, dir } = unpackDirectionalAnimId(animId)

  const safeDir = collapseDirForTexture(textureId, dir)

  return `${textureName}_${kind}_${safeDir}`
}
