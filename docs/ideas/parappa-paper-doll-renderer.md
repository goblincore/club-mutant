# PaRappa-Style Paper Doll 3D Renderer

A primitive 3D rendering engine that converts 2D flat character art into pseudo-billboard
3D characters — flat textured planes on a bone hierarchy, rendered with PSX-era aesthetics.

Reference: PaRappa the Rapper (PSX, 1996) — characters are 2D drawings mapped onto flat
planes, rigged with a skeleton so they animate in 3D space like paper cutouts.

## Status

- **Location**: `tools/paper-rig-editor/` (standalone sub-project in this repo)
- **Goal**: Standalone rig editor + renderer, eventually integrate into club-mutant
  (replace Phaser renderer with this custom engine)

## Core Idea

Each character = a tree of **textured quads** (transparent PNGs on planes) driven by a
**bone hierarchy** with keyframed animations. Perspective camera makes the flat planes
"pop" — foreshortening sells the 3D when limbs rotate toward/away from camera.

## Architecture

### 1. Renderer (Three.js)

- Each body part = `PlaneGeometry` + `MeshBasicMaterial` (unlit, alpha-transparent texture)
- No lighting — flat/unlit textures with bold outlines baked into the art
- Draw order managed by explicit `renderOrder` per part or slight z-offsets
- Perspective camera, low FOV (~40-50°)

### 2. Character Definition Format

JSON manifest per character:

```json
{
  "name": "example",
  "parts": [
    { "id": "torso", "texture": "torso.png", "pivot": [0.5, 0.8], "size": [64, 80] },
    { "id": "head", "texture": "head.png", "pivot": [0.5, 0.9], "size": [48, 48], "parent": "torso", "offset": [0, -40, 0] },
    { "id": "arm_l", "texture": "arm_l.png", "pivot": [0.9, 0.1], "size": [32, 50], "parent": "torso", "offset": [-20, 0, -1] }
  ]
}
```

- `pivot` — normalized origin point for rotation (the joint)
- `parent` — builds bone hierarchy
- `offset` — local position relative to parent (small z-offset controls draw order)

### 3. Skeleton / Rig

- Each "bone" = a `Three.Group` / `Object3D` node
- Textured plane is a child of its bone node
- Typical hierarchy: `root → torso → [head, arm_l, arm_r, hip] → [leg_l, leg_r]`
- Animating a bone transforms all children (standard scene graph)

### 4. Animation System

Keyframed bone transforms:

```json
{
  "name": "idle",
  "fps": 12,
  "length": 1.0,
  "tracks": [
    { "bone": "torso", "property": "rotation.z", "keys": [[0, 0], [0.5, 0.05], [1.0, 0]] },
    { "bone": "arm_l", "property": "rotation.z", "keys": [[0, 0.1], [0.5, -0.1], [1.0, 0.1]] }
  ]
}
```

- Low FPS (8-12) for choppy PSX feel
- Stepped interpolation = more authentic (linear also fine)
- Three.js `AnimationMixer` / `KeyframeTrack` maps directly to this
- **Preset animations** that work with any standard humanoid skeleton:
  idle, walk, wave, dance, sit, jump, talk

## Art Pipeline

Manual segmentation approach (keep it crude, that's the charm):

1. Artist draws or sources a flat 2D character illustration
2. **Manually segment** in Photoshop/Aseprite/GIMP — split into parts:
   head, torso, arm_l, arm_r, leg_l, leg_r (+ optional: hand_l, hand_r, hat, tail, etc.)
3. Export each part as transparent PNG with overlap padding at joints
4. Import into the **Rig Editor** (see below)
5. Place pivots, adjust offsets, preview with preset animations
6. Export character JSON manifest

### Why manual segmentation first

- AI segmentation (SAM etc.) is overkill for the crude aesthetic we want
- Manual gives full control over where joints land
- A character only needs ~5-8 parts — fast to cut by hand
- Can always add AI assist later as an optional accelerator

## Rig Editor (the key tool)

A simple web UI — the highest-leverage piece of the whole system.
The preview viewport reflects the final PSX-style output so it doubles as a renderer test.

### MVP features

- **Import parts**: drag-drop PNGs for each body part
- **Place pivots**: click to set rotation origin on each part
- **Build hierarchy**: simple parent assignment (dropdown or drag-to-connect)
- **Adjust offsets**: drag parts to position them relative to parent
- **Preview**: real-time 3D preview with orbit camera + PSX post-processing
- **Apply preset anims**: select from preset animations (idle, walk, wave, etc.)
  and see the rig animate immediately
- **Export**: save character manifest JSON + copy part textures to asset folder

### Stretch features (later)

- Custom keyframe editor with timeline
- Onion skinning (ghost of previous/next keyframe)
- Mirror mode (pose one side, auto-mirror to the other)
- Undo/redo
- AI-assisted segmentation

### Tech stack

- React + Vite
- Three.js via react-three-fiber (r3f) for the 3D viewport
- TailwindCSS for UI styling
- Zustand for state management (lightweight, no redux overhead for a standalone tool)

## PSX Post-Processing

All applied in the editor preview so what-you-see-is-what-you-get:

- **Vertex snapping**: snap verts to low-res grid in vertex shader (PSX had no sub-pixel)
- **Affine texture mapping**: skip perspective-correct UVs (classic PSX warp) via custom shader
- **Dithering**: Bayer matrix dither in post-process pass
- **Low-res render target**: render to 320×240, upscale with nearest-neighbor
- **Color depth reduction**: posterize to 15/16-bit color

## Integration Plan (future)

1. Build standalone editor + renderer in `tools/paper-rig-editor/`
2. Extract core renderer into a shared package
3. Replace Phaser renderer in club-mutant with custom Three.js-based engine
4. Characters authored in the editor load directly into the game

## Open Questions

- [ ] How many preset animations to ship with initially?
- [ ] Target character part count (minimum viable: 6 — head, torso, 2 arms, 2 legs)
- [ ] Face/expression swapping? (swap head texture variants)
- [ ] Should the editor support multi-angle views (front/side/back)?

## References

- PaRappa the Rapper (1996) — the gold standard for this style
- Um Jammer Lammy — same engine, same studio
- Paper Mario — similar paper-on-planes concept (orthographic)
- Three.js PlaneGeometry + MeshBasicMaterial docs
- Three.js AnimationMixer / KeyframeTrack docs
- react-three-fiber (r3f) docs
