import { describe, it, expect } from 'vitest'
import {
  TEXTURE_IDS,
  DIR_IDS,
  ANIM_KIND_IDS,
  packDirectionalAnimId,
  unpackDirectionalAnimId,
  encodeAnimKey,
  decodeAnimKey,
  sanitizeTextureId,
  sanitizeAnimId,
  encodeTextureName,
  decodeTextureName,
} from '../AnimationCodec.ts'

describe('AnimationCodec', () => {
  describe('packDirectionalAnimId / unpackDirectionalAnimId', () => {
    const kinds = Object.keys(ANIM_KIND_IDS) as Array<keyof typeof ANIM_KIND_IDS>
    const dirs = Object.keys(DIR_IDS) as Array<keyof typeof DIR_IDS>

    it('roundtrips every (kind, dir) combination', () => {
      for (const kind of kinds) {
        for (const dir of dirs) {
          const id = packDirectionalAnimId(kind, dir)
          const out = unpackDirectionalAnimId(id)
          expect(out).toEqual({ kind, dir })
        }
      }
    })

    it('packs into the documented bit layout (kind << 3 | dir)', () => {
      expect(packDirectionalAnimId('idle', 'down')).toBe(0)
      expect(packDirectionalAnimId('idle', 'up')).toBe(4)
      expect(packDirectionalAnimId('run', 'down')).toBe(8)
      expect(packDirectionalAnimId('sit', 'down_right')).toBe(23)
    })

    it('unpacking unknown kindId falls back to idle', () => {
      const out = unpackDirectionalAnimId(0b11_111) // kindId=3 (no key), dir=down_right
      expect(out.kind).toBe('idle')
      expect(out.dir).toBe('down_right')
    })
  })

  describe('encodeAnimKey / decodeAnimKey', () => {
    it('roundtrips mutant directional anims (8-way)', () => {
      const dirs = Object.keys(DIR_IDS) as Array<keyof typeof DIR_IDS>
      const kinds = ['idle', 'run', 'sit'] as const
      for (const kind of kinds) {
        for (const dir of dirs) {
          const key = `mutant_${kind}_${dir}`
          const { textureId, animId } = encodeAnimKey(key)
          expect(textureId).toBe(TEXTURE_IDS.mutant)
          expect(decodeAnimKey(textureId, animId)).toBe(key)
        }
      }
    })

    it('collapses 8-way directions to 4-way for non-mutant textures', () => {
      // adam doesn't have 8-way anims; up_right collapses to up.
      const { textureId, animId } = encodeAnimKey('adam_run_up_right')
      expect(textureId).toBe(TEXTURE_IDS.adam)
      expect(decodeAnimKey(textureId, animId)).toBe('adam_run_up')
    })

    it('treats walk as run (legacy alias)', () => {
      const { animId } = encodeAnimKey('mutant_walk_down')
      expect(animId).toBe(packDirectionalAnimId('run', 'down'))
    })

    it('encodes mutant special anims (boombox, djwip, transform)', () => {
      const { textureId, animId } = encodeAnimKey('mutant_boombox')
      expect(textureId).toBe(TEXTURE_IDS.mutant)
      expect(animId).toBe(24)
      expect(decodeAnimKey(textureId, animId)).toBe('mutant_boombox')
    })

    it('encodes mutant hit/punch/burn directional bases', () => {
      const cases = [
        { key: 'mutant_hit1_left', expectedAnimId: 32 + DIR_IDS.left },
        { key: 'mutant_hit2_up', expectedAnimId: 40 + DIR_IDS.up },
        { key: 'mutant_punch_down_right', expectedAnimId: 48 + DIR_IDS.down_right },
        { key: 'mutant_burn_down', expectedAnimId: 56 + DIR_IDS.down },
        { key: 'mutant_flamethrower_right', expectedAnimId: 64 + DIR_IDS.right },
      ]
      for (const { key, expectedAnimId } of cases) {
        const { textureId, animId } = encodeAnimKey(key)
        expect(textureId).toBe(TEXTURE_IDS.mutant)
        expect(animId).toBe(expectedAnimId)
        expect(decodeAnimKey(textureId, animId)).toBe(key)
      }
    })
  })

  describe('sanitizeTextureId', () => {
    it('returns mutant for non-numeric / NaN / Infinity / negative input', () => {
      expect(sanitizeTextureId(undefined)).toBe(TEXTURE_IDS.mutant)
      expect(sanitizeTextureId(null)).toBe(TEXTURE_IDS.mutant)
      expect(sanitizeTextureId('5')).toBe(TEXTURE_IDS.mutant)
      expect(sanitizeTextureId(NaN)).toBe(TEXTURE_IDS.mutant)
      expect(sanitizeTextureId(Infinity)).toBe(TEXTURE_IDS.mutant)
      expect(sanitizeTextureId(-1)).toBe(TEXTURE_IDS.mutant)
    })

    it('accepts valid texture IDs in range 0..19', () => {
      expect(sanitizeTextureId(0)).toBe(0)
      expect(sanitizeTextureId(19)).toBe(19)
      expect(sanitizeTextureId(7)).toBe(7)
    })

    it('rejects out-of-range texture IDs (> 19)', () => {
      expect(sanitizeTextureId(20)).toBe(TEXTURE_IDS.mutant)
      expect(sanitizeTextureId(999)).toBe(TEXTURE_IDS.mutant)
    })

    it('truncates fractional texture IDs', () => {
      expect(sanitizeTextureId(3.7)).toBe(3)
      expect(sanitizeTextureId(0.9)).toBe(0)
    })
  })

  describe('sanitizeAnimId', () => {
    const idleDown = packDirectionalAnimId('idle', 'down')

    it('returns idle/down fallback for non-numeric input', () => {
      expect(sanitizeAnimId(undefined, TEXTURE_IDS.mutant)).toBe(idleDown)
      expect(sanitizeAnimId('5', TEXTURE_IDS.mutant)).toBe(idleDown)
      expect(sanitizeAnimId(NaN, TEXTURE_IDS.mutant)).toBe(idleDown)
    })

    it('accepts directional anims (0..23) for any texture', () => {
      for (let id = 0; id < 24; id++) {
        expect(sanitizeAnimId(id, TEXTURE_IDS.mutant)).toBe(id)
        expect(sanitizeAnimId(id, TEXTURE_IDS.adam)).toBe(id)
      }
    })

    it('accepts mutant-only special anims (24..27) only for mutant texture', () => {
      expect(sanitizeAnimId(24, TEXTURE_IDS.mutant)).toBe(24)
      expect(sanitizeAnimId(27, TEXTURE_IDS.mutant)).toBe(27)
      expect(sanitizeAnimId(24, TEXTURE_IDS.adam)).toBe(idleDown)
    })

    it('accepts mutant-only hit/punch/burn ranges only for mutant texture', () => {
      expect(sanitizeAnimId(32, TEXTURE_IDS.mutant)).toBe(32) // hit1
      expect(sanitizeAnimId(40, TEXTURE_IDS.mutant)).toBe(40) // hit2
      expect(sanitizeAnimId(48, TEXTURE_IDS.mutant)).toBe(48) // punch
      expect(sanitizeAnimId(56, TEXTURE_IDS.mutant)).toBe(56) // burn
      expect(sanitizeAnimId(64, TEXTURE_IDS.mutant)).toBe(64) // flamethrower
      expect(sanitizeAnimId(32, TEXTURE_IDS.adam)).toBe(idleDown)
    })

    it('rejects out-of-range animIds outside any valid base', () => {
      expect(sanitizeAnimId(31, TEXTURE_IDS.mutant)).toBe(idleDown) // gap between 28–31
      expect(sanitizeAnimId(72, TEXTURE_IDS.mutant)).toBe(idleDown) // past flamethrower range
      expect(sanitizeAnimId(99, TEXTURE_IDS.mutant)).toBe(idleDown)
    })
  })

  describe('encodeTextureName / decodeTextureName', () => {
    it('roundtrips all named textures', () => {
      for (const name of Object.keys(TEXTURE_IDS) as Array<keyof typeof TEXTURE_IDS>) {
        const id = encodeTextureName(name)
        expect(decodeTextureName(id)).toBe(name)
      }
    })

    it('falls back to mutant for unknown names', () => {
      expect(encodeTextureName('unknown')).toBe(TEXTURE_IDS.mutant)
      expect(decodeTextureName(99)).toBe('mutant')
    })
  })
})
