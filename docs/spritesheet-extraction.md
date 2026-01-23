# Spritesheet Extraction (Magenta-Guided)

This repo includes source character animation sheets where each animation is enclosed by a magenta rectangle border.

The goal of this workflow is to automatically extract each animation rectangle into its own PNG and generate a `manifest.json` describing how Phaser should slice the frames.

## Input

- `conversion/base/supermutant-basicanimations.png`

## Output

The extractor writes to:

- `conversion/out/<sheet-name>/blocks/`
  - `block_000.png`, `block_001.png`, ...
- `conversion/out/<sheet-name>/manifest.json`

`manifest.json` contains per-block metadata:

- `key`: default name (`block_000`, ...)
- `file`: path relative to the manifest
- `frameWidth`, `frameHeight`: per-frame dimensions for Phaser slicing
- `rows`, `cols`, `frameCount`: inferred grid info

## Install (Python)

The extractor uses Python with OpenCV.

- `python3 -m pip install opencv-python pillow numpy`

## Run

- `python3 conversion/scripts/extract_anim_blocks.py --input conversion/base/supermutant-basicanimations.png`

This will write outputs under:

- `conversion/out/supermutant-basicanimations/`

## Post-processing

- Rename `block_###.png` files to meaningful names (e.g. `idle.png`, `walk.png`).
- Update `manifest.json` accordingly (either rename `key` fields or keep `key` and only rename files).

## Phaser usage

Load each extracted block as a Phaser spritesheet using the manifest metadata.

- Use `frameWidth` and `frameHeight` when calling `this.load.spritesheet(...)`.
- Create an animation using frames `0..frameCount-1`.

## Notes

- The script extracts the full interior of each magenta rectangle (minus a small configurable border shrink).
- Grid slicing assumes each extracted block is a fully-populated uniform grid with padding between cells.
