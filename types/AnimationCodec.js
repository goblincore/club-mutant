"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeAnimKey = exports.encodeAnimKey = exports.unpackDirectionalAnimId = exports.packDirectionalAnimId = exports.encodeTextureName = exports.decodeTextureName = exports.sanitizeAnimId = exports.sanitizeTextureId = exports.ANIM_KIND_IDS = exports.DIR_IDS = exports.TEXTURE_IDS = void 0;
exports.TEXTURE_IDS = {
    mutant: 0,
    adam: 1,
    ash: 2,
    lucy: 3,
    nancy: 4,
};
const textureNamesById = {
    0: 'mutant',
    1: 'adam',
    2: 'ash',
    3: 'lucy',
    4: 'nancy',
};
exports.DIR_IDS = {
    down: 0,
    down_left: 1,
    left: 2,
    up_left: 3,
    up: 4,
    up_right: 5,
    right: 6,
    down_right: 7,
};
const dirNamesById = {
    0: 'down',
    1: 'down_left',
    2: 'left',
    3: 'up_left',
    4: 'up',
    5: 'up_right',
    6: 'right',
    7: 'down_right',
};
const hasEightWayAnimsByTextureId = {
    [exports.TEXTURE_IDS.mutant]: true,
    [exports.TEXTURE_IDS.adam]: false,
    [exports.TEXTURE_IDS.ash]: false,
    [exports.TEXTURE_IDS.lucy]: false,
    [exports.TEXTURE_IDS.nancy]: false,
};
const collapseDirForTexture = (textureId, dir) => {
    if (hasEightWayAnimsByTextureId[textureId])
        return dir;
    if (dir === 'up_left' || dir === 'up_right')
        return 'up';
    if (dir === 'down_left' || dir === 'down_right')
        return 'down';
    return dir;
};
exports.ANIM_KIND_IDS = {
    idle: 0,
    run: 1,
    sit: 2,
};
const SPECIAL_ANIM_IDS = {
    mutant_boombox: 24,
    mutant_djwip: 25,
    mutant_transform: 26,
    mutant_transform_reverse: 27,
};
const HIT1_BASE = 32;
const HIT2_BASE = 40;
const PUNCH_BASE = 48;
const BURN_BASE = 56;
const FLAMETHROWER_BASE = 64;
const sanitizeTextureId = (textureId) => {
    if (typeof textureId !== 'number' || !Number.isFinite(textureId))
        return exports.TEXTURE_IDS.mutant;
    const tid = Math.trunc(textureId);
    return textureNamesById[tid] ? tid : exports.TEXTURE_IDS.mutant;
};
exports.sanitizeTextureId = sanitizeTextureId;
const sanitizeAnimId = (animId, textureId) => {
    if (typeof animId !== 'number' || !Number.isFinite(animId)) {
        return (0, exports.packDirectionalAnimId)('idle', 'down');
    }
    const aid = Math.trunc(animId);
    if (aid >= 0 && aid < 24)
        return aid;
    if (textureId === exports.TEXTURE_IDS.mutant && aid >= 24 && aid <= 27)
        return aid;
    if (textureId === exports.TEXTURE_IDS.mutant && aid >= HIT1_BASE && aid < HIT1_BASE + 8)
        return aid;
    if (textureId === exports.TEXTURE_IDS.mutant && aid >= HIT2_BASE && aid < HIT2_BASE + 8)
        return aid;
    if (textureId === exports.TEXTURE_IDS.mutant && aid >= PUNCH_BASE && aid < PUNCH_BASE + 8)
        return aid;
    if (textureId === exports.TEXTURE_IDS.mutant && aid >= BURN_BASE && aid < BURN_BASE + 8)
        return aid;
    if (textureId === exports.TEXTURE_IDS.mutant && aid >= FLAMETHROWER_BASE && aid < FLAMETHROWER_BASE + 8)
        return aid;
    return (0, exports.packDirectionalAnimId)('idle', 'down');
};
exports.sanitizeAnimId = sanitizeAnimId;
const decodeTextureName = (textureId) => {
    return textureNamesById[textureId] ?? 'mutant';
};
exports.decodeTextureName = decodeTextureName;
const encodeTextureName = (name) => {
    const key = name;
    return exports.TEXTURE_IDS[key] ?? exports.TEXTURE_IDS.mutant;
};
exports.encodeTextureName = encodeTextureName;
const packDirectionalAnimId = (kind, dir) => {
    const kindId = exports.ANIM_KIND_IDS[kind];
    const dirId = exports.DIR_IDS[dir];
    return (kindId << 3) | dirId;
};
exports.packDirectionalAnimId = packDirectionalAnimId;
const unpackDirectionalAnimId = (animId) => {
    const kindId = (animId >> 3) & 0b11;
    const dirId = animId & 0b111;
    const kind = Object.keys(exports.ANIM_KIND_IDS).find((k) => exports.ANIM_KIND_IDS[k] === kindId);
    return {
        kind: kind ?? 'idle',
        dir: dirNamesById[dirId] ?? 'down',
    };
};
exports.unpackDirectionalAnimId = unpackDirectionalAnimId;
const encodeAnimKey = (animKey) => {
    if (animKey in SPECIAL_ANIM_IDS) {
        return {
            textureId: exports.TEXTURE_IDS.mutant,
            animId: SPECIAL_ANIM_IDS[animKey],
        };
    }
    if (animKey.startsWith('mutant_hit1_') ||
        animKey.startsWith('mutant_hit2_') ||
        animKey.startsWith('mutant_punch_') ||
        animKey.startsWith('mutant_burn_') ||
        animKey.startsWith('mutant_flamethrower_')) {
        const parts = animKey.split('_');
        const kindRaw = parts[1] ?? 'hit1';
        const dirRaw = parts.length >= 3 ? parts.slice(2).join('_') : 'down';
        const dirId = exports.DIR_IDS[dirRaw];
        const safeDirId = typeof dirId === 'number' ? dirId : exports.DIR_IDS.down;
        let base = HIT1_BASE;
        if (kindRaw === 'hit2')
            base = HIT2_BASE;
        else if (kindRaw === 'punch')
            base = PUNCH_BASE;
        else if (kindRaw === 'burn')
            base = BURN_BASE;
        else if (kindRaw === 'flamethrower')
            base = FLAMETHROWER_BASE;
        return {
            textureId: exports.TEXTURE_IDS.mutant,
            animId: base + safeDirId,
        };
    }
    const parts = animKey.split('_');
    const texture = parts[0] ?? 'mutant';
    const textureId = (0, exports.encodeTextureName)(texture);
    const kindRaw = parts[1] ?? 'idle';
    const kind = kindRaw === 'idle' || kindRaw === 'run' || kindRaw === 'sit'
        ? kindRaw
        : kindRaw === 'walk'
            ? 'run'
            : 'idle';
    const dirRaw = parts.length >= 3 ? parts.slice(2).join('_') : 'down';
    const parsedDir = exports.DIR_IDS[dirRaw] !== undefined ? dirRaw : 'down';
    const dir = collapseDirForTexture(textureId, parsedDir);
    return {
        textureId,
        animId: (0, exports.packDirectionalAnimId)(kind, dir),
    };
};
exports.encodeAnimKey = encodeAnimKey;
const decodeAnimKey = (textureId, animId) => {
    const textureName = (0, exports.decodeTextureName)(textureId);
    if (textureId === exports.TEXTURE_IDS.mutant) {
        if (animId >= HIT1_BASE && animId < HIT1_BASE + 8) {
            const dirId = animId - HIT1_BASE;
            const dir = dirNamesById[dirId] ?? 'down';
            return `mutant_hit1_${dir}`;
        }
        if (animId >= HIT2_BASE && animId < HIT2_BASE + 8) {
            const dirId = animId - HIT2_BASE;
            const dir = dirNamesById[dirId] ?? 'down';
            return `mutant_hit2_${dir}`;
        }
        if (animId >= PUNCH_BASE && animId < PUNCH_BASE + 8) {
            const dirId = animId - PUNCH_BASE;
            const dir = dirNamesById[dirId] ?? 'down';
            return `mutant_punch_${dir}`;
        }
        if (animId >= BURN_BASE && animId < BURN_BASE + 8) {
            const dirId = animId - BURN_BASE;
            const dir = dirNamesById[dirId] ?? 'down';
            return `mutant_burn_${dir}`;
        }
        if (animId >= FLAMETHROWER_BASE && animId < FLAMETHROWER_BASE + 8) {
            const dirId = animId - FLAMETHROWER_BASE;
            const dir = dirNamesById[dirId] ?? 'down';
            return `mutant_flamethrower_${dir}`;
        }
        const special = Object.keys(SPECIAL_ANIM_IDS).find((k) => SPECIAL_ANIM_IDS[k] === animId);
        if (special)
            return special;
    }
    const { kind, dir } = (0, exports.unpackDirectionalAnimId)(animId);
    const safeDir = collapseDirForTexture(textureId, dir);
    return `${textureName}_${kind}_${safeDir}`;
};
exports.decodeAnimKey = decodeAnimKey;
