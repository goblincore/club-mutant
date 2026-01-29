# Spritesheet Extraction (Magenta-Guided)

This repo includes source character animation sheets where each animation is enclosed by a magenta rectangle border.

The goal of this workflow is to automatically extract each animation rectangle into its own PNG and generate a `manifest.json` describing how Phaser should slice the frames.

## Input

- `conversion/base/supermutant-basicanimations.png`
- `conversion/base/griddedpinksupermutant.png` (pink guide lines)

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

On macOS/Homebrew Python you may see `error: externally-managed-environment` (PEP 668) if you try to install packages system-wide.

Use a repo-local virtualenv instead:

- `python3 -m venv .venv`
- `./.venv/bin/python -m pip install --upgrade pip`
- `./.venv/bin/python -m pip install opencv-python pillow numpy`

## Run

Default (recommended): extract blocks and manifest without modifying pixels:

- `./.venv/bin/python conversion/scripts/extract_anim_blocks.py --input conversion/base/supermutant-basicanimations.png`

Pink guides (gridded sheet):

- `./.venv/bin/python conversion/scripts/extract_anim_blocks.py --input conversion/base/griddedpinksupermutant.png --guide-color pink`

Optional: export per-frame PNGs with deterministic naming using a frames map:

- `./.venv/bin/python conversion/scripts/extract_anim_blocks.py --input conversion/base/griddedpinksupermutant.png --guide-color pink --export-frames --export-frames-flat --frames-map conversion/frames-map.example.json`

Optional (experimental): attempt to make the background transparent:

- `./.venv/bin/python conversion/scripts/extract_anim_blocks.py --input conversion/base/supermutant-basicanimations.png --transparent-bg`

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

## Transparency (optional)

The spritesheets in this repo often use a dark/purple gradient background. Automated transparency can be finicky and may remove desired shadow pixels depending on settings.

By default the extractor does not attempt transparency.

If experimenting:

- `--transparent-bg` enables RGBA output.
- `--transparent-mode colorkey` (default) uses a per-block background color key and only removes background pixels connected to the block edges.
- `--transparent-mode hsv` uses fixed HSV thresholds.

If you need transparency for production, consider doing it as a dedicated post-process step and verifying results by eye.

## Troubleshooting

- If you see `ModuleNotFoundError: No module named 'cv2'`, the dependencies were not installed into the Python you are using. Prefer running via `./.venv/bin/python ...`.
- If you see `No module named python3`, you likely ran a command shaped like `python -m python3 -m pip ...`. The correct form is `python -m pip ...`.
