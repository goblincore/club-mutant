/* @ts-self-types="./acs_web.d.ts" */

/**
 * An ACS character file.
 */
export class AcsFile {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AcsFileFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_acsfile_free(ptr, 0);
    }
    /**
     * List all animation names.
     * @returns {string[]}
     */
    animationNames() {
        const ret = wasm.acsfile_animationNames(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Character description.
     * @returns {string}
     */
    get description() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.acsfile_description(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get summary info for all animations (useful for building UI lists).
     * @returns {AnimationInfo[]}
     */
    getAllAnimationInfo() {
        const ret = wasm.acsfile_getAllAnimationInfo(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Get animation metadata by name.
     * Note: This clones the animation data to avoid borrow issues in WASM.
     * @param {string} name
     * @returns {AnimationData}
     */
    getAnimation(name) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.acsfile_getAnimation(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return AnimationData.__wrap(ret[0]);
    }
    /**
     * Get a single image by index as RGBA data.
     * @param {number} index
     * @returns {ImageData}
     */
    getImage(index) {
        const ret = wasm.acsfile_getImage(this.__wbg_ptr, index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ImageData.__wrap(ret[0]);
    }
    /**
     * Get sound data by index as WAV bytes.
     * @param {number} index
     * @returns {Uint8Array}
     */
    getSound(index) {
        const ret = wasm.acsfile_getSound(this.__wbg_ptr, index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Get sound data by index as ArrayBuffer (suitable for decodeAudioData).
     * @param {number} index
     * @returns {ArrayBuffer}
     */
    getSoundAsArrayBuffer(index) {
        const ret = wasm.acsfile_getSoundAsArrayBuffer(this.__wbg_ptr, index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Get all character states (animation groupings).
     * @returns {StateInfo[]}
     */
    getStates() {
        const ret = wasm.acsfile_getStates(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Character height in pixels.
     * @returns {number}
     */
    get height() {
        const ret = wasm.acsfile_height(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get number of images in the file.
     * @returns {number}
     */
    imageCount() {
        const ret = wasm.acsfile_imageCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Character name.
     * @returns {string}
     */
    get name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.acsfile_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Load an ACS file from a Uint8Array.
     * @param {Uint8Array} data
     */
    constructor(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.acsfile_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        AcsFileFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * List animation names suitable for direct playback.
     * Excludes helper animations (Return/Continued variants) that are meant to be chained automatically.
     * @returns {string[]}
     */
    playableAnimationNames() {
        const ret = wasm.acsfile_playableAnimationNames(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Render a complete animation frame by compositing all frame images.
     * Returns RGBA image data at the character's full dimensions.
     * @param {string} animation
     * @param {number} frame_index
     * @returns {ImageData}
     */
    renderFrame(animation, frame_index) {
        const ptr0 = passStringToWasm0(animation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.acsfile_renderFrame(this.__wbg_ptr, ptr0, len0, frame_index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ImageData.__wrap(ret[0]);
    }
    /**
     * Get number of sounds in the file.
     * @returns {number}
     */
    soundCount() {
        const ret = wasm.acsfile_soundCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Character width in pixels.
     * @returns {number}
     */
    get width() {
        const ret = wasm.acsfile_width(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) AcsFile.prototype[Symbol.dispose] = AcsFile.prototype.free;

/**
 * Animation metadata.
 */
export class AnimationData {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AnimationData.prototype);
        obj.__wbg_ptr = ptr;
        AnimationDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AnimationDataFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_animationdata_free(ptr, 0);
    }
    /**
     * Number of frames in this animation.
     * @returns {number}
     */
    get frameCount() {
        const ret = wasm.animationdata_frameCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get frame metadata by index.
     * @param {number} index
     * @returns {FrameData | undefined}
     */
    getFrame(index) {
        const ret = wasm.animationdata_getFrame(this.__wbg_ptr, index);
        return ret === 0 ? undefined : FrameData.__wrap(ret);
    }
    /**
     * Get branches for a frame by index.
     * @param {number} index
     * @returns {BranchData[]}
     */
    getFrameBranches(index) {
        const ret = wasm.animationdata_getFrameBranches(this.__wbg_ptr, index);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Check if any frame in this animation has an associated sound.
     * @returns {boolean}
     */
    get hasSound() {
        const ret = wasm.animationdata_hasSound(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Animation name.
     * @returns {string}
     */
    get name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.animationdata_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Name of the animation to return to after this one completes.
     * @returns {string | undefined}
     */
    get returnAnimation() {
        const ret = wasm.animationdata_returnAnimation(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * How this animation transitions when complete.
     * @returns {TransitionType}
     */
    get transitionType() {
        const ret = wasm.animationdata_transitionType(this.__wbg_ptr);
        return TransitionType.__wrap(ret);
    }
}
if (Symbol.dispose) AnimationData.prototype[Symbol.dispose] = AnimationData.prototype.free;

/**
 * Summary information about an animation (lightweight, no cleanup needed).
 */
export class AnimationInfo {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AnimationInfo.prototype);
        obj.__wbg_ptr = ptr;
        AnimationInfoFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AnimationInfoFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_animationinfo_free(ptr, 0);
    }
    /**
     * Number of frames in this animation.
     * @returns {number}
     */
    get frameCount() {
        const ret = wasm.animationinfo_frameCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Whether any frame in this animation has an associated sound.
     * @returns {boolean}
     */
    get hasSound() {
        const ret = wasm.animationinfo_hasSound(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Animation name.
     * @returns {string}
     */
    get name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.animationinfo_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Name of the animation to return to after this one completes.
     * @returns {string | undefined}
     */
    get returnAnimation() {
        const ret = wasm.animationinfo_returnAnimation(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
}
if (Symbol.dispose) AnimationInfo.prototype[Symbol.dispose] = AnimationInfo.prototype.free;

/**
 * A branch option for probabilistic frame transitions.
 */
export class BranchData {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BranchData.prototype);
        obj.__wbg_ptr = ptr;
        BranchDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BranchDataFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_branchdata_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get frameIndex() {
        const ret = wasm.__wbg_get_branchdata_frameIndex(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get probability() {
        const ret = wasm.__wbg_get_branchdata_probability(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) BranchData.prototype[Symbol.dispose] = BranchData.prototype.free;

/**
 * A single frame in an animation.
 */
export class FrameData {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(FrameData.prototype);
        obj.__wbg_ptr = ptr;
        FrameDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FrameDataFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_framedata_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get branchCount() {
        const ret = wasm.__wbg_get_framedata_branchCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get durationMs() {
        const ret = wasm.__wbg_get_framedata_durationMs(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get imageCount() {
        const ret = wasm.__wbg_get_framedata_imageCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get soundIndex() {
        const ret = wasm.__wbg_get_framedata_soundIndex(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) FrameData.prototype[Symbol.dispose] = FrameData.prototype.free;

/**
 * RGBA image data suitable for use with HTML Canvas.
 */
export class ImageData {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ImageData.prototype);
        obj.__wbg_ptr = ptr;
        ImageDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ImageDataFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_imagedata_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get height() {
        const ret = wasm.__wbg_get_imagedata_height(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get width() {
        const ret = wasm.__wbg_get_imagedata_width(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get RGBA pixel data as Uint8Array.
     * @returns {Uint8Array}
     */
    get data() {
        const ret = wasm.imagedata_data(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) ImageData.prototype[Symbol.dispose] = ImageData.prototype.free;

/**
 * A character state grouping animations.
 */
export class StateInfo {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(StateInfo.prototype);
        obj.__wbg_ptr = ptr;
        StateInfoFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StateInfoFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stateinfo_free(ptr, 0);
    }
    /**
     * List of animation names in this state.
     * @returns {string[]}
     */
    get animations() {
        const ret = wasm.stateinfo_animations(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * State name (e.g., "Idle", "Speaking", "Greeting").
     * @returns {string}
     */
    get name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.stateinfo_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) StateInfo.prototype[Symbol.dispose] = StateInfo.prototype.free;

/**
 * How an animation transitions when complete.
 * 0 = UseReturnAnimation, 1 = UseExitBranch, 2 = None
 */
export class TransitionType {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(TransitionType.prototype);
        obj.__wbg_ptr = ptr;
        TransitionTypeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TransitionTypeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_transitiontype_free(ptr, 0);
    }
    /**
     * Type 2: No automatic transition
     * @returns {boolean}
     */
    get isNone() {
        const ret = wasm.transitiontype_isNone(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Type 1: Uses exit branches (for graceful interruption)
     * @returns {boolean}
     */
    get usesExitBranch() {
        const ret = wasm.transitiontype_usesExitBranch(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Type 0: Play the return_animation when complete
     * @returns {boolean}
     */
    get usesReturnAnimation() {
        const ret = wasm.transitiontype_usesReturnAnimation(this.__wbg_ptr);
        return ret !== 0;
    }
}
if (Symbol.dispose) TransitionType.prototype[Symbol.dispose] = TransitionType.prototype.free;

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_83742b46f01ce22d: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_animationinfo_new: function(arg0) {
            const ret = AnimationInfo.__wrap(arg0);
            return ret;
        },
        __wbg_branchdata_new: function(arg0) {
            const ret = BranchData.__wrap(arg0);
            return ret;
        },
        __wbg_length_ea16607d7b61445b: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_new_5f486cdf45a04d78: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_a5de2c0e786216d6: function(arg0) {
            const ret = new ArrayBuffer(arg0 >>> 0);
            return ret;
        },
        __wbg_new_from_slice_22da9388ac046e50: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_set_8c0b3ffcf05d61c2: function(arg0, arg1, arg2) {
            arg0.set(getArrayU8FromWasm0(arg1, arg2));
        },
        __wbg_stateinfo_new: function(arg0) {
            const ret = StateInfo.__wrap(arg0);
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./acs_web_bg.js": import0,
    };
}

const AcsFileFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_acsfile_free(ptr >>> 0, 1));
const AnimationDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_animationdata_free(ptr >>> 0, 1));
const AnimationInfoFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_animationinfo_free(ptr >>> 0, 1));
const BranchDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_branchdata_free(ptr >>> 0, 1));
const FrameDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_framedata_free(ptr >>> 0, 1));
const ImageDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_imagedata_free(ptr >>> 0, 1));
const StateInfoFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stateinfo_free(ptr >>> 0, 1));
const TransitionTypeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_transitiontype_free(ptr >>> 0, 1));

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('acs_web_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
