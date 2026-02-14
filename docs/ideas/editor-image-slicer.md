# Paper Rig Editor — Image Slicer Mode

Add a "slicer mode" to the paper-rig-editor that lets users load a single full character image, remove the background, overlay draggable bone regions, and auto-slice into parts — replacing the current workflow of manually cutting images before importing.

## Current vs Proposed Flow

**Current:** Manually cut image into separate PNGs → drop into editor → assign bones/pivots/offsets → export

**Proposed:** Drop single full image → auto-remove background → overlay bone region rectangles → adjust regions → editor slices into parts → fine-tune pivots/offsets as usual → export

## Implementation

### Step 1: Slicer Mode UI Shell

- "Slicer" tab/mode toggle in Toolbar
- When active, replaces 3D Viewport with a 2D canvas view showing the loaded image
- Left panel shows bone region list instead of parts list

### Step 2: Image Loading + Background Removal

- Accept a single image drop (PNG, JPG, WebP)
- Render to offscreen `<canvas>` for pixel manipulation
- Sample corner pixels to detect background color
- Threshold-based removal: pixels within configurable color-distance of bg → alpha 0
- Tolerance slider (default ~30/255) for anti-aliased edges
- Optional flood-fill from edges only (avoids removing interior matches)

### Step 3: Bone Region Overlay (Polygon)

- 6 bone roles (head, torso, arm_l, arm_r, leg_l, leg_r) — user draws freeform polygon per role
- Click-to-place vertices on a 2D canvas overlay, click near first point to close
- Color-coded + labeled at centroid, vertex dots shown
- Right-click / Esc / Cmd+Z to undo last point
- Can toggle individual regions on/off
- Point-in-polygon hit testing for selection

### Step 4: Slice + Generate Parts

- "Apply" clips background-removed image per region via `canvas.drawImage()` source rect
- Trims transparent padding (tight bounding box)
- Creates `CharacterPart` per region with computed offset, smart pivot defaults, auto-wired parentId
- Switches to normal editor mode with parts populated

### Step 5: Polish

- Allow re-entering slicer mode to re-adjust
- Handle already-transparent PNGs (skip bg removal)
- Allow custom bone regions beyond the standard 6

## Technical Notes

- All processing is client-side (Canvas API)
- No changes needed to existing CharacterRenderer, AnimationMixer, presets, export, or types
- New files: `SlicerView.tsx`, `SlicerPanel.tsx`, `utils/backgroundRemoval.ts`, `utils/imageSlicing.ts`

## Difficulty

| Component                         | Effort           | Risk                        |
| --------------------------------- | ---------------- | --------------------------- |
| UI shell / mode toggle            | Small            | Low                         |
| Background removal                | Medium           | Medium — anti-aliased edges |
| Bone region overlay (drag+resize) | Medium-Large     | Medium — UX polish          |
| Slice + generate parts            | Small-Medium     | Low                         |
| **Total**                         | **Medium-Large** | ~2-3 sessions               |

## Status: v1 Implemented

The slicer mode is fully implemented with polygon regions (not rectangles). Key implementation details:

- **Polygon drawing**: Click-to-place vertices on a canvas overlay, click near first point to close. Right-click/Esc/Cmd+Z to undo.
- **Canvas rendering**: All polygon overlays drawn via 2D canvas (fill + stroke + vertex dots + centroid labels). No third-party drag library needed.
- **Image slicing**: Uses `ctx.clip()` with polygon path to extract each region, then trims transparent padding.
- **Offset calculation**: Auto-computes pivot positions and parent offsets relative to torso centroid.
- **Point-in-polygon**: Ray-casting algorithm for click-to-select existing polygons.
