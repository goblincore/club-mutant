# Paper Rig Editor

A browser-based tool for building paper-doll character rigs for Club Mutant's 3D client. Characters are flat textured planes arranged on a bone hierarchy — like PaRappa the Rapper.

**Run:** `npm run dev` (Vite, port 5174)

## Two Modes

### Slicer Mode

Start here when working from a full character image (PNG/JPG/WebP).

1. Switch to **Slicer** in the toolbar
2. **Drop an image** onto the canvas
3. Background is auto-removed (corner-sampling + color-distance threshold). Adjust tolerance with the slider.
4. **Draw polygon regions** for each bone — click "draw" next to a bone in the left panel, then click on the image to place vertices. Click near the first point (white dot) to close the polygon.
   - Right-click or Esc to undo last vertex
   - Cmd/Ctrl+Z to undo
5. Click **Apply & Build Parts** — the image is clipped per polygon, trimmed, and loaded into the rig editor with smart defaults:
   - **Pivots**: head → bottom-center (neck), arms → upper-inner (shoulder), legs → upper-inner (hip), torso → upper-center
   - **Parenting**: all limbs + head auto-parent to torso
   - **Z-order**: torso 0, head 2, arms -1, legs -2

### Rig Mode

Fine-tune parts and preview animations.

- **Left panel**: part list. Drop individual PNGs here to add parts manually.
- **Center**: 3D viewport with the assembled character. Select parts to see pivot/offset gizmos.
- **Right panel**: properties (pivot, offset, parent, z-index, bone role) and animation controls.
- **Toolbar**: PSX shader toggle, export button.

#### Tools

- **Select** (V): click parts in viewport
- **Pivot** (P): drag to reposition pivot point
- **Offset** (O): drag to adjust offset from parent

#### Animations

Built-in presets: idle, wave, walk, dance. Select one and hit play to preview. Animations target standard bone roles (torso, head, arm_l, arm_r, leg_l, leg_r).

## Export

Click **Export** → downloads a `.zip` containing:
- `manifest.json` — part definitions, pivots, offsets, parenting, animations
- All part images as PNGs

This format is loaded directly by `client-3d/src/character/CharacterLoader.ts`.

## Bone Roles

| Role | Description |
|------|-------------|
| `torso` | Root part, everything parents to this |
| `head` | Parents to torso |
| `arm_l` | Character's left arm (viewer's right) |
| `arm_r` | Character's right arm (viewer's left) |
| `leg_l` | Character's left leg |
| `leg_r` | Character's right leg |

## Tech

- Vite 5 + React 18 + TypeScript
- react-three-fiber + drei (3D viewport)
- Zustand (state management)
- TailwindCSS (styling)
- Canvas 2D API (background removal, polygon clipping, image slicing)
- JSZip (export)

## Key Files

| File | Purpose |
|------|---------|
| `src/store.ts` | Zustand store — all editor + slicer state |
| `src/types.ts` | CharacterPart, BoneRegion, AnimationClip, etc. |
| `src/presets.ts` | Built-in animation presets |
| `src/components/SlicerView.tsx` | Slicer canvas — image display, polygon drawing overlay |
| `src/components/SlicerPanel.tsx` | Slicer left panel — bone list, draw/clear controls |
| `src/components/Viewport.tsx` | 3D rig viewport |
| `src/components/PartsPanel.tsx` | Rig mode left panel — part list, PNG drop |
| `src/components/PropertiesPanel.tsx` | Rig mode right panel — part properties |
| `src/components/CharacterRenderer.tsx` | 3D character rendering (textured planes on bone hierarchy) |
| `src/components/Toolbar.tsx` | Top bar — mode toggle, PSX toggle, export |
| `src/utils/backgroundRemoval.ts` | Corner-sampling BG detection + threshold removal |
| `src/utils/imageSlicing.ts` | Polygon clip + trim + pivot/offset calculation |

## Roadmap

- `docs/ideas/custom-character-system.md` — user-uploaded avatars (schema changes, upload endpoint, lobby flow)
- `docs/ideas/editor-image-slicer.md` — slicer mode design doc (v1 implemented)
