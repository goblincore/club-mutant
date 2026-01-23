import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class BlockInfo:
    key: str
    file: str
    x: int
    y: int
    width: int
    height: int
    rows: int
    cols: int
    frameWidth: int
    frameHeight: int
    frameCount: int
    needsReview: bool


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _read_image(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise FileNotFoundError(str(path))
    return image


def _bgr(image: np.ndarray) -> np.ndarray:
    if image.ndim != 3:
        raise ValueError("Expected 3D image array")

    if image.shape[2] == 4:
        return image[:, :, :3]

    if image.shape[2] == 3:
        return image

    raise ValueError(f"Unsupported channel count: {image.shape[2]}")


def _magenta_mask(image_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)

    lower = np.array([140, 80, 80], dtype=np.uint8)
    upper = np.array([170, 255, 255], dtype=np.uint8)

    mask = cv2.inRange(hsv, lower, upper)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    return mask


def _sprite_mask(image_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    s = hsv[:, :, 1]
    v = hsv[:, :, 2]

    mask = (v > 45) | (s > 90)
    return mask.astype(np.uint8)


def _apply_background_transparency_hsv(
    crop_bgr: np.ndarray,
    bg_v_max: int,
    bg_s_max: int,
    alpha_blur: int,
) -> np.ndarray:
    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    s = hsv[:, :, 1]
    v = hsv[:, :, 2]

    bg_v_max = int(max(0, min(255, bg_v_max)))
    bg_s_max = int(max(0, min(255, bg_s_max)))

    background = (v <= bg_v_max) & (s <= bg_s_max)
    alpha = (~background).astype(np.uint8) * 255

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel, iterations=1)
    alpha = cv2.dilate(alpha, kernel, iterations=1)

    alpha_blur = int(max(0, alpha_blur))
    if alpha_blur > 0:
        if alpha_blur % 2 == 0:
            alpha_blur += 1
        alpha = cv2.GaussianBlur(alpha, (alpha_blur, alpha_blur), 0)

    b, g, r = cv2.split(crop_bgr)
    rgba = cv2.merge([b, g, r, alpha])
    return rgba


def _trim_rgba(
    image_rgba: np.ndarray,
    alpha_threshold: int,
    pad: int,
) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    if image_rgba.ndim != 3 or image_rgba.shape[2] != 4:
        raise ValueError("Expected RGBA image")

    alpha_threshold = int(max(0, min(255, alpha_threshold)))
    pad = int(max(0, pad))

    alpha = image_rgba[:, :, 3]
    ys, xs = np.where(alpha > alpha_threshold)
    if ys.size == 0 or xs.size == 0:
        h, w = image_rgba.shape[:2]
        return image_rgba, (0, 0, w, h)

    x1 = int(max(0, xs.min() - pad))
    y1 = int(max(0, ys.min() - pad))
    x2 = int(min(image_rgba.shape[1], xs.max() + 1 + pad))
    y2 = int(min(image_rgba.shape[0], ys.max() + 1 + pad))

    return image_rgba[y1:y2, x1:x2], (x1, y1, x2 - x1, y2 - y1)


def _estimate_background_centers_lab(
    crop_bgr: np.ndarray,
    border_px: int,
    k: int,
) -> np.ndarray:
    h, w = crop_bgr.shape[:2]
    border_px = int(max(1, min(min(h, w) // 2, border_px)))

    border = np.zeros((h, w), dtype=np.uint8)
    border[:border_px, :] = 1
    border[-border_px:, :] = 1
    border[:, :border_px] = 1
    border[:, -border_px:] = 1

    candidates_mask = border.astype(bool)

    if int(np.count_nonzero(candidates_mask)) < 250:
        crop_lab = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2LAB)
        median = np.median(crop_lab.reshape(-1, 3).astype(np.float32), axis=0)
        return median.reshape(1, 3)

    crop_lab = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    samples = crop_lab[candidates_mask]

    k = int(max(1, min(6, k)))
    if samples.shape[0] < k * 200:
        median = np.median(samples, axis=0)
        return median.reshape(1, 3)

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    flags = cv2.KMEANS_PP_CENTERS
    compactness, labels, centers = cv2.kmeans(samples, k, None, criteria, 3, flags)

    counts = np.bincount(labels.reshape(-1), minlength=k)
    order = np.argsort(-counts)
    centers = centers[order]
    return centers


def _apply_background_transparency_colorkey(
    crop_bgr: np.ndarray,
    bg_delta: float,
    border_px: int,
    bg_k: int,
    alpha_blur: int,
) -> np.ndarray:
    centers = _estimate_background_centers_lab(crop_bgr, border_px=border_px, k=bg_k)

    crop_lab = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    centers = centers.astype(np.float32)

    h, w = crop_lab.shape[:2]
    pixels = crop_lab.reshape(-1, 3)

    diffs = pixels[:, None, :] - centers[None, :, :]
    dist2 = np.sum(diffs * diffs, axis=2)
    min_dist2 = np.min(dist2, axis=1).reshape(h, w)

    bg_delta = float(max(0.0, bg_delta))
    bg_candidate = (min_dist2 <= (bg_delta * bg_delta)).astype(np.uint8)

    h2, w2 = bg_candidate.shape[:2]
    border_px = int(max(1, min(min(h2, w2) // 2, border_px)))

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(bg_candidate, connectivity=8)

    touches = np.zeros((num_labels,), dtype=np.uint8)

    touches[labels[0, :]] = 1
    touches[labels[-1, :]] = 1
    touches[labels[:, 0]] = 1
    touches[labels[:, -1]] = 1

    if border_px > 1:
        touches[labels[:border_px, :].reshape(-1)] = 1
        touches[labels[-border_px:, :].reshape(-1)] = 1
        touches[labels[:, :border_px].reshape(-1)] = 1
        touches[labels[:, -border_px:].reshape(-1)] = 1

    touches[0] = 0

    bg_final = touches[labels].astype(bool)
    alpha = (~bg_final).astype(np.uint8) * 255

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel, iterations=1)
    alpha = cv2.dilate(alpha, kernel, iterations=1)

    alpha_blur = int(max(0, alpha_blur))
    if alpha_blur > 0:
        if alpha_blur % 2 == 0:
            alpha_blur += 1
        alpha = cv2.GaussianBlur(alpha, (alpha_blur, alpha_blur), 0)

    b, g, r = cv2.split(crop_bgr)
    rgba = cv2.merge([b, g, r, alpha])
    return rgba


def _connected_components_non_magenta(magenta_mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    non_magenta = (magenta_mask == 0).astype(np.uint8)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        non_magenta, connectivity=8
    )
    return labels, stats, centroids, num_labels


def _filter_candidate_boxes(
    image_bgr: np.ndarray,
    magenta_mask: np.ndarray,
    stats: np.ndarray,
    num_labels: int,
    shrink_px: int,
    min_area: int,
    min_sprite_pixels: int,
) -> list[tuple[int, int, int, int]]:
    h, w = image_bgr.shape[:2]
    sprite_mask = _sprite_mask(image_bgr)

    boxes: list[tuple[int, int, int, int]] = []

    for label in range(1, num_labels):
        x, y, bw, bh, area = stats[label]

        if area < min_area:
            continue

        x1 = max(0, x + shrink_px)
        y1 = max(0, y + shrink_px)
        x2 = min(w, x + bw - shrink_px)
        y2 = min(h, y + bh - shrink_px)

        if x2 <= x1 or y2 <= y1:
            continue

        region_magenta = magenta_mask[y1:y2, x1:x2]
        if int(np.count_nonzero(region_magenta)) > 0:
            continue

        region_sprite = sprite_mask[y1:y2, x1:x2]
        sprite_count = int(np.count_nonzero(region_sprite))

        if sprite_count < min_sprite_pixels:
            continue

        boxes.append((x1, y1, x2 - x1, y2 - y1))

    boxes.sort(key=lambda b: (b[1], b[0]))
    return boxes


def _infer_grid(
    block_bgr: np.ndarray,
    grid_kernel: int,
    grid_close_k: int,
) -> tuple[int, int, int, int, bool]:
    h, w = block_bgr.shape[:2]

    mask = _sprite_mask(block_bgr)

    grid_kernel = max(1, int(grid_kernel))
    if grid_kernel % 2 == 0:
        grid_kernel += 1

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (grid_kernel, grid_kernel))
    mask = cv2.dilate(mask, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)

    col_sum = np.sum(mask, axis=0)
    row_sum = np.sum(mask, axis=1)

    col_gap = col_sum <= max(1, int(h * 0.002))
    row_gap = row_sum <= max(1, int(w * 0.002))

    def close_1d_content(content: np.ndarray, k: int) -> np.ndarray:
        if content.ndim != 1:
            raise ValueError("Expected 1D array")

        k = max(1, int(k))
        arr = content.astype(np.uint8)[None, :]
        k1 = cv2.getStructuringElement(cv2.MORPH_RECT, (k, 1))
        closed = cv2.morphologyEx(arr, cv2.MORPH_CLOSE, k1, iterations=1)
        return closed[0].astype(bool)

    def segments_from_content(content: np.ndarray) -> list[tuple[int, int]]:
        segments: list[tuple[int, int]] = []
        in_seg = False
        start = 0

        for i in range(int(content.shape[0])):
            if content[i] and not in_seg:
                in_seg = True
                start = i
            if not content[i] and in_seg:
                end = i
                if end - start >= 6:
                    segments.append((start, end))
                in_seg = False

        if in_seg:
            end = int(content.shape[0])
            if end - start >= 6:
                segments.append((start, end))

        return segments

    col_content = close_1d_content(~col_gap, k=grid_close_k)
    row_content = close_1d_content(~row_gap, k=grid_close_k)

    col_segments = segments_from_content(col_content)
    row_segments = segments_from_content(row_content)

    cols = len(col_segments)
    rows = len(row_segments)

    if cols <= 0 or rows <= 0:
        return 1, 1, w, h, True

    frame_w = int(round(w / cols))
    frame_h = int(round(h / rows))

    needs_review = False

    if frame_w <= 0 or frame_h <= 0:
        return 1, 1, w, h, True

    if abs(frame_w * cols - w) > 4 or abs(frame_h * rows - h) > 4:
        needs_review = True

    col_widths = np.array([end - start for start, end in col_segments], dtype=np.float32)
    row_heights = np.array([end - start for start, end in row_segments], dtype=np.float32)

    if col_widths.size > 0 and np.std(col_widths) > max(2.0, np.mean(col_widths) * 0.15):
        needs_review = True
    if row_heights.size > 0 and np.std(row_heights) > max(2.0, np.mean(row_heights) * 0.15):
        needs_review = True

    if cols > 64 or rows > 64:
        needs_review = True

    return rows, cols, frame_w, frame_h, needs_review


def extract_blocks(
    input_path: Path,
    out_dir: Path,
    shrink_px: int,
    min_area: int,
    min_sprite_pixels: int,
    grid_kernel: int,
    grid_close_k: int,
    transparent_bg: bool,
    transparent_mode: str,
    bg_delta: float,
    bg_border_px: int,
    bg_k: int,
    bg_v_max: int,
    bg_s_max: int,
    alpha_blur: int,
    export_frames: bool,
    export_frames_flat: bool,
    frames_trim: bool,
    frames_alpha_threshold: int,
    frames_trim_pad: int,
) -> tuple[list[BlockInfo], Path]:
    image = _read_image(input_path)
    image_bgr = _bgr(image)

    magenta_mask = _magenta_mask(image_bgr)
    _, stats, _, num_labels = _connected_components_non_magenta(magenta_mask)

    boxes = _filter_candidate_boxes(
        image_bgr=image_bgr,
        magenta_mask=magenta_mask,
        stats=stats,
        num_labels=num_labels,
        shrink_px=shrink_px,
        min_area=min_area,
        min_sprite_pixels=min_sprite_pixels,
    )

    blocks_dir = out_dir / "blocks"
    _ensure_dir(blocks_dir)

    frames_dir = out_dir / "frames"
    if export_frames:
        _ensure_dir(frames_dir)

    blocks: list[BlockInfo] = []

    for idx, (x, y, bw, bh) in enumerate(boxes):
        key = f"block_{idx:03d}"
        filename = f"{key}.png"
        file_rel = f"blocks/{filename}"

        crop = image[y : y + bh, x : x + bw]
        crop_bgr = _bgr(crop)

        if transparent_bg:
            if transparent_mode == "hsv":
                crop_out = _apply_background_transparency_hsv(
                    crop_bgr,
                    bg_v_max=bg_v_max,
                    bg_s_max=bg_s_max,
                    alpha_blur=alpha_blur,
                )
            else:
                crop_out = _apply_background_transparency_colorkey(
                    crop_bgr,
                    bg_delta=bg_delta,
                    border_px=bg_border_px,
                    bg_k=bg_k,
                    alpha_blur=alpha_blur,
                )
        else:
            crop_out = crop

        cv2.imwrite(str(blocks_dir / filename), crop_out)

        block_bgr = image_bgr[y : y + bh, x : x + bw]
        rows, cols, frame_w, frame_h, needs_review = _infer_grid(
            block_bgr,
            grid_kernel=grid_kernel,
            grid_close_k=grid_close_k,
        )

        if export_frames:
            if export_frames_flat:
                block_frames_dir = frames_dir
            else:
                block_frames_dir = frames_dir / key
                _ensure_dir(block_frames_dir)

            for row in range(int(rows)):
                for col in range(int(cols)):
                    cx1 = int(col * frame_w)
                    cy1 = int(row * frame_h)
                    cx2 = int(min(int((col + 1) * frame_w), crop_bgr.shape[1]))
                    cy2 = int(min(int((row + 1) * frame_h), crop_bgr.shape[0]))

                    if cx2 <= cx1 or cy2 <= cy1:
                        continue

                    frame_bgr = crop_bgr[cy1:cy2, cx1:cx2]

                    if transparent_bg:
                        if transparent_mode == "hsv":
                            frame_out = _apply_background_transparency_hsv(
                                frame_bgr,
                                bg_v_max=bg_v_max,
                                bg_s_max=bg_s_max,
                                alpha_blur=alpha_blur,
                            )
                        else:
                            frame_out = _apply_background_transparency_colorkey(
                                frame_bgr,
                                bg_delta=bg_delta,
                                border_px=bg_border_px,
                                bg_k=bg_k,
                                alpha_blur=alpha_blur,
                            )
                    else:
                        frame_out = frame_bgr

                    if frames_trim:
                        if frame_out.ndim != 3 or frame_out.shape[2] != 4:
                            raise ValueError("--frames-trim requires --transparent-bg")
                        frame_out, _ = _trim_rgba(
                            frame_out,
                            alpha_threshold=frames_alpha_threshold,
                            pad=frames_trim_pad,
                        )

                    if export_frames_flat:
                        frame_name = f"{key}_r{row:02d}_c{col:02d}.png"
                    else:
                        frame_name = f"r{row:02d}_c{col:02d}.png"
                    cv2.imwrite(str(block_frames_dir / frame_name), frame_out)

        blocks.append(
            BlockInfo(
                key=key,
                file=file_rel,
                x=int(x),
                y=int(y),
                width=int(bw),
                height=int(bh),
                rows=int(rows),
                cols=int(cols),
                frameWidth=int(frame_w),
                frameHeight=int(frame_h),
                frameCount=int(rows * cols),
                needsReview=bool(needs_review),
            )
        )

    manifest_path = out_dir / "manifest.json"
    manifest = {
        "source": str(input_path.as_posix()),
        "blocks": [asdict(b) for b in blocks],
    }

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    return blocks, manifest_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        required=True,
        help="Path to the source spritesheet PNG",
    )
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Output directory (default: conversion/out/<sheet-name>)",
    )
    parser.add_argument("--shrink-px", type=int, default=2)
    parser.add_argument("--min-area", type=int, default=10_000)
    parser.add_argument("--min-sprite-pixels", type=int, default=2_000)
    parser.add_argument(
        "--grid-kernel",
        type=int,
        default=5,
        help="Odd kernel size used to dilate/close sprite mask before grid inference",
    )
    parser.add_argument(
        "--grid-close-k",
        type=int,
        default=7,
        help="1D close window size used to stabilize row/col content bands",
    )
    parser.add_argument(
        "--transparent-bg",
        action="store_true",
        help="Write RGBA PNGs with dark background made transparent",
    )
    parser.add_argument(
        "--transparent-mode",
        choices=["colorkey", "hsv"],
        default="colorkey",
        help="Transparency mode: 'colorkey' (recommended) removes pixels similar to the block background; 'hsv' uses fixed V/S thresholds",
    )
    parser.add_argument(
        "--bg-delta",
        type=float,
        default=22.0,
        help="(colorkey) Max Lab distance to treat a pixel as background (lower = less removed)",
    )
    parser.add_argument(
        "--bg-border-px",
        type=int,
        default=12,
        help="(colorkey) Border thickness used to sample background pixels",
    )
    parser.add_argument(
        "--bg-k",
        type=int,
        default=2,
        help="(colorkey) Number of background clusters to fit from border pixels",
    )
    parser.add_argument(
        "--bg-v-max",
        type=int,
        default=40,
        help="HSV Value threshold for background pixels (lower = more aggressive transparency)",
    )
    parser.add_argument(
        "--bg-s-max",
        type=int,
        default=80,
        help="HSV Saturation threshold for background pixels (lower = more aggressive transparency)",
    )
    parser.add_argument(
        "--alpha-blur",
        type=int,
        default=0,
        help="Gaussian blur kernel size for alpha feathering (0 disables)",
    )
    parser.add_argument(
        "--export-frames",
        action="store_true",
        help="Export individual frame PNGs per detected block (out_dir/frames/<block_key>/rXX_cYY.png)",
    )
    parser.add_argument(
        "--export-frames-flat",
        action="store_true",
        help="Export frames into a single folder with globally unique names (out_dir/frames/block_XXX_rYY_cZZ.png)",
    )
    parser.add_argument(
        "--frames-trim",
        action="store_true",
        help="Trim transparent border around each exported frame (requires --transparent-bg)",
    )
    parser.add_argument(
        "--frames-alpha-threshold",
        type=int,
        default=0,
        help="Alpha threshold for trimming frames (higher trims more; only used with --frames-trim)",
    )
    parser.add_argument(
        "--frames-trim-pad",
        type=int,
        default=0,
        help="Padding to keep around trimmed frames (only used with --frames-trim)",
    )

    args = parser.parse_args()

    input_path = Path(args.input).resolve()

    if args.out_dir is None:
        sheet_name = input_path.stem
        repo_root = Path(__file__).resolve().parents[2]
        if args.transparent_bg:
            sheet_name = f"{sheet_name}-transparent-{args.transparent_mode}"
        out_dir = (repo_root / "conversion" / "out" / sheet_name).resolve()
    else:
        out_dir = Path(args.out_dir).resolve()

    _ensure_dir(out_dir)

    blocks, manifest_path = extract_blocks(
        input_path=input_path,
        out_dir=out_dir,
        shrink_px=args.shrink_px,
        min_area=args.min_area,
        min_sprite_pixels=args.min_sprite_pixels,
        grid_kernel=args.grid_kernel,
        grid_close_k=args.grid_close_k,
        transparent_bg=bool(args.transparent_bg),
        transparent_mode=str(args.transparent_mode),
        bg_delta=float(args.bg_delta),
        bg_border_px=int(args.bg_border_px),
        bg_k=int(args.bg_k),
        bg_v_max=args.bg_v_max,
        bg_s_max=args.bg_s_max,
        alpha_blur=args.alpha_blur,
        export_frames=bool(args.export_frames),
        export_frames_flat=bool(args.export_frames_flat),
        frames_trim=bool(args.frames_trim),
        frames_alpha_threshold=int(args.frames_alpha_threshold),
        frames_trim_pad=int(args.frames_trim_pad),
    )

    needs_review = sum(1 for b in blocks if b.needsReview)

    print(f"Extracted {len(blocks)} blocks")
    print(f"Manifest: {manifest_path}")
    print(f"Blocks needing review: {needs_review}")


if __name__ == "__main__":
    main()
