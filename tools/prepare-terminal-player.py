"""Slice the imagegen player artwork for the interactive CRT HUD.

python3 tools/prepare-terminal-player.py /path/to/generated-player.png

Requires Pillow. This only crops/resizes the supplied image and extracts its
existing knob; text, playback symbols, and controls remain live HTML.
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    source = Image.open(args.source).convert('RGBA')
    # Exclude almost invisible outlying pixels from the generator's alpha crop.
    bounds = source.getchannel('A').point(lambda a: 255 if a >= 32 else 0).getbbox()
    if not bounds:
        raise ValueError('Player artwork has no opaque content')
    x0, y0, x1, y1 = bounds
    bounds = (max(0, x0 - 8), max(0, y0 - 8), min(source.width, x1 + 8), min(source.height, y1 + 8))
    player = source.crop(bounds)
    player = player.resize((1000, round(player.height * 1000 / player.width)), Image.Resampling.LANCZOS)
    target = ROOT / 'client-3d/public/ui/terminal'
    target.mkdir(parents=True, exist_ok=True)
    player.save(target / 'player-v2.png', optimize=True)

    # Existing round knob, including its pointer, isolated for a real volume dial.
    knob_bounds = (1812, 232, 2056, 476)
    knob = source.crop(knob_bounds)
    mask = Image.new('L', knob.size)
    ImageDraw.Draw(mask).ellipse((1, 1, knob.width - 2, knob.height - 2), fill=255)
    knob.putalpha(ImageChops.multiply(knob.getchannel('A'), mask))
    knob.resize((112, 112), Image.Resampling.LANCZOS).save(target / 'player-knob-v2.png', optimize=True)
    button = source.crop((1196, 249, 1380, 467))
    button.resize((92, 109), Image.Resampling.LANCZOS).save(target / 'transport-button-v2.png', optimize=True)
    metadata = {'sourceSize': list(source.size), 'crop': list(bounds), 'outputSize': list(player.size), 'knobSourceCrop': list(knob_bounds)}
    (target / 'player-v2.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(metadata))


if __name__ == '__main__':
    main()
