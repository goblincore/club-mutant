from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class AnimationDef:
    key: str
    prefix: str
    start: int
    end: int
    repeat: int
    frameRate: float


@dataclass(frozen=True)
class GroupDef:
    base: str
    frameCount: int
    rows: int
    cols: int
    needsReview: bool


def _infer_rows(base: str, frame_count: int) -> tuple[int, bool]:
    lowered = base.lower()

    if "single" in lowered:
        return 1, False

    if "static" in lowered and frame_count == 6:
        return 6, False

    if frame_count % 6 == 0:
        return 6, False

    return 1, True


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^a-z0-9_]+", "_", value)
    value = re.sub(r"_+", "_", value)
    return value.strip("_")


def _action_from_base(base: str) -> str:
    if base.startswith("mutant-"):
        base = base[len("mutant-") :]

    return _slugify(base.replace("-", "_"))


def _looping_for_action(action: str) -> bool:
    return (
        "idle" in action
        or "walk" in action
        or "block" in action
        or "aim" in action
        or "static" in action
    )


def _frame_rate_for_action(action: str, base_rate: float) -> float:
    if "idle" in action:
        return base_rate * 0.6

    if "walk" in action:
        return base_rate

    if "block" in action or "aim" in action or "static" in action:
        return base_rate * 0.5

    return base_rate


def _dir_rows_for_group(rows: int) -> dict[str, int]:
    if rows == 6:
        return {
            "up_right": 0,
            "right": 1,
            "down_right": 2,
            "down": 3,
            "down_left": 3,
            "left": 4,
            "up_left": 5,
            "up": 5,
        }

    return {
        "up_right": 0,
        "right": 0,
        "down_right": 0,
        "down": 0,
        "down_left": 0,
        "left": 0,
        "up_left": 0,
        "up": 0,
    }


def _discover_groups(frames_dir: Path) -> dict[str, list[int]]:
    rx = re.compile(r"^(?P<base>.+)-(?P<idx>\d+)\.png$")

    groups: dict[str, list[int]] = {}

    for path in frames_dir.glob("*.png"):
        match = rx.match(path.name)
        if not match:
            continue

        base = match.group("base")
        idx = int(match.group("idx"))

        if base not in groups:
            groups[base] = []

        groups[base].append(idx)

    for base, idxs in groups.items():
        idxs.sort()

    return groups


def _build_defs(frames_dir: Path, base_rate: float) -> tuple[list[GroupDef], list[AnimationDef]]:
    groups_map = _discover_groups(frames_dir)

    group_defs: list[GroupDef] = []
    anim_defs: list[AnimationDef] = []

    for base, idxs in sorted(groups_map.items()):
        frame_count = len(idxs)
        rows, needs_review = _infer_rows(base, frame_count)

        if rows <= 0:
            continue

        cols = frame_count // rows
        if rows * cols != frame_count:
            rows = 1
            cols = frame_count
            needs_review = True

        group_defs.append(
            GroupDef(
                base=base,
                frameCount=frame_count,
                rows=rows,
                cols=cols,
                needsReview=needs_review,
            )
        )

        action = _action_from_base(base)
        repeat = -1 if _looping_for_action(action) else 0
        frame_rate = _frame_rate_for_action(action, base_rate)

        dir_rows = _dir_rows_for_group(rows)

        for dir_key, row_idx in dir_rows.items():
            start = row_idx * cols
            end = start + cols - 1

            anim_defs.append(
                AnimationDef(
                    key=f"mutant_ripped_{action}_{dir_key}",
                    prefix=f"{base}-",
                    start=start,
                    end=end,
                    repeat=repeat,
                    frameRate=frame_rate,
                )
            )

    return group_defs, anim_defs


def _write_manifest(out_path: Path, group_defs: list[GroupDef], anim_defs: list[AnimationDef]) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    data = {
        "groups": [asdict(g) for g in group_defs],
        "animations": [asdict(a) for a in anim_defs],
    }

    out_path.write_text(json.dumps(data, indent=2) + "\n")


def _write_ts_defs(out_path: Path, anim_defs: list[AnimationDef]) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []

    lines.append("import Phaser from 'phaser'\n")

    lines.append("type MutantRippedAnimDef = {\n")
    lines.append("  key: string\n")
    lines.append("  prefix: string\n")
    lines.append("  start: number\n")
    lines.append("  end: number\n")
    lines.append("  repeat: number\n")
    lines.append("  frameRate: number\n")
    lines.append("}\n\n")

    lines.append("const mutantRippedAnimDefs: MutantRippedAnimDef[] = [\n")

    for a in anim_defs:
        lines.append("  {\n")
        lines.append(f"    key: {json.dumps(a.key)},\n")
        lines.append(f"    prefix: {json.dumps(a.prefix)},\n")
        lines.append(f"    start: {a.start},\n")
        lines.append(f"    end: {a.end},\n")
        lines.append(f"    repeat: {a.repeat},\n")
        lines.append(f"    frameRate: {a.frameRate:.6g},\n")
        lines.append("  },\n")

    lines.append("]\n\n")

    lines.append("export const createMutantRippedAnims = (\n")
    lines.append("  anims: Phaser.Animations.AnimationManager\n")
    lines.append(") => {\n")
    lines.append("  const atlasKey = 'mutant_ripped'\n\n")

    lines.append("  for (const def of mutantRippedAnimDefs) {\n")
    lines.append("    if (anims.exists(def.key)) continue\n\n")

    lines.append("    anims.create({\n")
    lines.append("      key: def.key,\n")
    lines.append("      frames: anims.generateFrameNames(atlasKey, {\n")
    lines.append("        start: def.start,\n")
    lines.append("        end: def.end,\n")
    lines.append("        prefix: def.prefix,\n")
    lines.append("      }),\n")
    lines.append("      repeat: def.repeat,\n")
    lines.append("      frameRate: def.frameRate,\n")
    lines.append("    })\n")

    lines.append("  }\n")
    lines.append("}\n")

    out_path.write_text("".join(lines))


def _run_texture_packer(
    frames_dir: Path,
    output_data: Path,
    output_sheet: Path,
    max_size: int,
) -> None:
    output_data.parent.mkdir(parents=True, exist_ok=True)
    output_sheet.parent.mkdir(parents=True, exist_ok=True)

    template_png = output_sheet

    if "{n" not in template_png.name:
        template_png = output_sheet.with_name(f"{output_sheet.stem}-{{n1}}{output_sheet.suffix}")

    cmd = [
        "TexturePacker",
        "--format",
        "phaser",
        "--data",
        str(output_data),
        "--sheet",
        str(template_png),
        "--algorithm",
        "MaxRects",
        "--maxrects-heuristics",
        "Best",
        "--trim-sprite-names",
        "--trim-mode",
        "Crop",
        "--disable-rotation",
        "--max-size",
        str(max_size),
        "--multipack",
        str(frames_dir),
    ]

    subprocess.check_call(cmd)

    if output_data.exists():
        return

    fallback = output_data.with_name(f"{output_data.stem}-{output_data.suffix}")
    if fallback.exists():
        fallback.replace(output_data)
        return

    raise FileNotFoundError(f"Expected atlas JSON not found: {output_data}")


def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--frames-dir",
        default="conversion/base/ripped_sprites_individual_export",
    )

    parser.add_argument(
        "--out-manifest",
        default="conversion/out/mutant_ripped/manifest.json",
    )

    parser.add_argument(
        "--out-ts",
        default="client/src/anims/MutantRippedAnims.ts",
    )

    parser.add_argument(
        "--base-frame-rate",
        type=float,
        default=15.0,
    )

    parser.add_argument(
        "--pack",
        action="store_true",
    )

    parser.add_argument(
        "--out-atlas-json",
        default="client/public/assets/character/mutant_ripped.json",
    )

    parser.add_argument(
        "--out-atlas-png",
        default="client/public/assets/character/mutant_ripped.png",
    )

    parser.add_argument(
        "--max-size",
        type=int,
        default=2048,
    )

    args = parser.parse_args()

    frames_dir = Path(args.frames_dir)

    group_defs, anim_defs = _build_defs(frames_dir=frames_dir, base_rate=args.base_frame_rate)

    _write_manifest(Path(args.out_manifest), group_defs, anim_defs)
    _write_ts_defs(Path(args.out_ts), anim_defs)

    if args.pack:
        _run_texture_packer(
            frames_dir=frames_dir,
            output_data=Path(args.out_atlas_json),
            output_sheet=Path(args.out_atlas_png),
            max_size=args.max_size,
        )


if __name__ == "__main__":
    main()
