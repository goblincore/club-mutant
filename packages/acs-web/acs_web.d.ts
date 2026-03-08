/* tslint:disable */
/* eslint-disable */

/**
 * An ACS character file.
 */
export class AcsFile {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * List all animation names.
     */
    animationNames(): string[];
    /**
     * Get summary info for all animations (useful for building UI lists).
     */
    getAllAnimationInfo(): AnimationInfo[];
    /**
     * Get animation metadata by name.
     * Note: This clones the animation data to avoid borrow issues in WASM.
     */
    getAnimation(name: string): AnimationData;
    /**
     * Get a single image by index as RGBA data.
     */
    getImage(index: number): ImageData;
    /**
     * Get sound data by index as WAV bytes.
     */
    getSound(index: number): Uint8Array;
    /**
     * Get sound data by index as ArrayBuffer (suitable for decodeAudioData).
     */
    getSoundAsArrayBuffer(index: number): ArrayBuffer;
    /**
     * Get all character states (animation groupings).
     */
    getStates(): StateInfo[];
    /**
     * Get number of images in the file.
     */
    imageCount(): number;
    /**
     * Load an ACS file from a Uint8Array.
     */
    constructor(data: Uint8Array);
    /**
     * List animation names suitable for direct playback.
     * Excludes helper animations (Return/Continued variants) that are meant to be chained automatically.
     */
    playableAnimationNames(): string[];
    /**
     * Render a complete animation frame by compositing all frame images.
     * Returns RGBA image data at the character's full dimensions.
     */
    renderFrame(animation: string, frame_index: number): ImageData;
    /**
     * Get number of sounds in the file.
     */
    soundCount(): number;
    /**
     * Character description.
     */
    readonly description: string;
    /**
     * Character height in pixels.
     */
    readonly height: number;
    /**
     * Character name.
     */
    readonly name: string;
    /**
     * Character width in pixels.
     */
    readonly width: number;
}

/**
 * Animation metadata.
 */
export class AnimationData {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get frame metadata by index.
     */
    getFrame(index: number): FrameData | undefined;
    /**
     * Get branches for a frame by index.
     */
    getFrameBranches(index: number): BranchData[];
    /**
     * Number of frames in this animation.
     */
    readonly frameCount: number;
    /**
     * Check if any frame in this animation has an associated sound.
     */
    readonly hasSound: boolean;
    /**
     * Animation name.
     */
    readonly name: string;
    /**
     * Name of the animation to return to after this one completes.
     */
    readonly returnAnimation: string | undefined;
    /**
     * How this animation transitions when complete.
     */
    readonly transitionType: TransitionType;
}

/**
 * Summary information about an animation (lightweight, no cleanup needed).
 */
export class AnimationInfo {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Number of frames in this animation.
     */
    readonly frameCount: number;
    /**
     * Whether any frame in this animation has an associated sound.
     */
    readonly hasSound: boolean;
    /**
     * Animation name.
     */
    readonly name: string;
    /**
     * Name of the animation to return to after this one completes.
     */
    readonly returnAnimation: string | undefined;
}

/**
 * A branch option for probabilistic frame transitions.
 */
export class BranchData {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly frameIndex: number;
    readonly probability: number;
}

/**
 * A single frame in an animation.
 */
export class FrameData {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly branchCount: number;
    readonly durationMs: number;
    readonly imageCount: number;
    readonly soundIndex: number;
}

/**
 * RGBA image data suitable for use with HTML Canvas.
 */
export class ImageData {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly height: number;
    readonly width: number;
    /**
     * Get RGBA pixel data as Uint8Array.
     */
    readonly data: Uint8Array;
}

/**
 * A character state grouping animations.
 */
export class StateInfo {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * List of animation names in this state.
     */
    readonly animations: string[];
    /**
     * State name (e.g., "Idle", "Speaking", "Greeting").
     */
    readonly name: string;
}

/**
 * How an animation transitions when complete.
 * 0 = UseReturnAnimation, 1 = UseExitBranch, 2 = None
 */
export class TransitionType {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Type 2: No automatic transition
     */
    readonly isNone: boolean;
    /**
     * Type 1: Uses exit branches (for graceful interruption)
     */
    readonly usesExitBranch: boolean;
    /**
     * Type 0: Play the return_animation when complete
     */
    readonly usesReturnAnimation: boolean;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_acsfile_free: (a: number, b: number) => void;
    readonly __wbg_animationdata_free: (a: number, b: number) => void;
    readonly __wbg_animationinfo_free: (a: number, b: number) => void;
    readonly __wbg_branchdata_free: (a: number, b: number) => void;
    readonly __wbg_framedata_free: (a: number, b: number) => void;
    readonly __wbg_get_branchdata_frameIndex: (a: number) => number;
    readonly __wbg_get_branchdata_probability: (a: number) => number;
    readonly __wbg_get_framedata_branchCount: (a: number) => number;
    readonly __wbg_get_framedata_imageCount: (a: number) => number;
    readonly __wbg_get_framedata_soundIndex: (a: number) => number;
    readonly __wbg_get_imagedata_height: (a: number) => number;
    readonly __wbg_imagedata_free: (a: number, b: number) => void;
    readonly __wbg_stateinfo_free: (a: number, b: number) => void;
    readonly __wbg_transitiontype_free: (a: number, b: number) => void;
    readonly acsfile_animationNames: (a: number) => [number, number];
    readonly acsfile_description: (a: number) => [number, number];
    readonly acsfile_getAllAnimationInfo: (a: number) => [number, number];
    readonly acsfile_getAnimation: (a: number, b: number, c: number) => [number, number, number];
    readonly acsfile_getImage: (a: number, b: number) => [number, number, number];
    readonly acsfile_getSound: (a: number, b: number) => [number, number, number];
    readonly acsfile_getSoundAsArrayBuffer: (a: number, b: number) => [number, number, number];
    readonly acsfile_getStates: (a: number) => [number, number];
    readonly acsfile_height: (a: number) => number;
    readonly acsfile_imageCount: (a: number) => number;
    readonly acsfile_name: (a: number) => [number, number];
    readonly acsfile_new: (a: number, b: number) => [number, number, number];
    readonly acsfile_playableAnimationNames: (a: number) => [number, number];
    readonly acsfile_renderFrame: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly acsfile_soundCount: (a: number) => number;
    readonly acsfile_width: (a: number) => number;
    readonly animationdata_frameCount: (a: number) => number;
    readonly animationdata_getFrame: (a: number, b: number) => number;
    readonly animationdata_getFrameBranches: (a: number, b: number) => [number, number];
    readonly animationdata_hasSound: (a: number) => number;
    readonly animationdata_name: (a: number) => [number, number];
    readonly animationdata_returnAnimation: (a: number) => [number, number];
    readonly animationdata_transitionType: (a: number) => number;
    readonly animationinfo_frameCount: (a: number) => number;
    readonly animationinfo_hasSound: (a: number) => number;
    readonly animationinfo_name: (a: number) => [number, number];
    readonly animationinfo_returnAnimation: (a: number) => [number, number];
    readonly imagedata_data: (a: number) => any;
    readonly stateinfo_animations: (a: number) => [number, number];
    readonly stateinfo_name: (a: number) => [number, number];
    readonly transitiontype_isNone: (a: number) => number;
    readonly transitiontype_usesExitBranch: (a: number) => number;
    readonly transitiontype_usesReturnAnimation: (a: number) => number;
    readonly __wbg_get_framedata_durationMs: (a: number) => number;
    readonly __wbg_get_imagedata_width: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
