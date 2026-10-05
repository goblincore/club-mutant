#!/usr/bin/env python3
"""Package Blender frame folders for the web. Requires Pillow with WebP support."""
import argparse
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ICONS = ['mutanttube', 'mutantbook', 'messenger', 'mutantmail', 'netscape', 'settings', 'filemanager']


def frames_from(source, fps):
    if source.is_dir():
        paths = sorted(source.glob('[0-9][0-9][0-9].png'))
        frames = [Image.open(path).convert('RGBA') for path in paths]
        durations = [1000 / fps] * len(frames)
    else:
        frames, durations = [], []
        with Image.open(source) as image:
            for index in range(image.n_frames):
                image.seek(index)
                frames.append(image.convert('RGBA'))
                durations.append(image.info.get('duration', 1000 / fps))
    if len(frames) != 24:
        raise ValueError(f'{source}: expected 24 animation frames, got {len(frames)}')
    # WebP stores whole milliseconds; round cumulative time to avoid loop drift.
    elapsed, previous, ticks = 0, 0, []
    for duration in durations:
        elapsed += duration
        tick = round(elapsed)
        ticks.append(tick - previous)
        previous = tick
    return frames, ticks


def animation(source, destination, fps, lossless=False):
    frames, ticks = frames_from(source, fps)
    frames[0].save(destination, format='WEBP', save_all=True, append_images=frames[1:],
                   duration=ticks, loop=0, quality=92, lossless=lossless, method=6)
    with Image.open(destination) as image:
        if image.n_frames != len(frames) or image.size != frames[0].size or image.info.get('loop') != 0:
            raise ValueError(f'{destination}: animation metadata changed')
    print(f'{destination.relative_to(ROOT)}: {destination.stat().st_size:,} bytes, {len(frames)} frames, {sum(ticks)}ms', flush=True)
    return frames[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--icon-source', type=Path, default=Path('/tmp/club-mutant-liquid-icons'))
    parser.add_argument('--sword-source', type=Path, default=Path('/tmp/club-mutant-gothic-sword/cursor'))
    parser.add_argument('--wallpaper-source', type=Path, default=ROOT / 'packages/konpyuuta/src/assets/liquid-signal.jpg')
    args = parser.parse_args()
    icons = ROOT / 'packages/konpyuuta/public/icons/apps'
    for name in ICONS:
        source = args.icon_source / name
        if not source.is_dir():
            source = args.icon_source / (name + '.apng')
        first_frame = animation(source, icons / (name + '.webp'), 6)
        poster = icons / (name + '.png')
        first_frame.save(poster, optimize=True)
    animation(args.sword_source, ROOT / 'packages/konpyuuta/src/assets/cursors/sword.webp', 12, lossless=True)
    wallpaper = ROOT / 'packages/konpyuuta/src/assets/liquid-signal.webp'
    with Image.open(args.wallpaper_source) as image:
        image.save(wallpaper, quality=92, method=6)
    print(f'{wallpaper.relative_to(ROOT)}: {wallpaper.stat().st_size:,} bytes', flush=True)


if __name__ == '__main__':
    main()
