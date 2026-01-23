import argparse
import json
import re
import subprocess
from shutil import which
from typing import Optional
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


def _read_frames_map(path: Path) -> dict:
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise ValueError("frames map must be a JSON object")
    blocks = data.get("blocks")
    if blocks is not None and not isinstance(blocks, dict):
        raise ValueError("frames map 'blocks' must be an object")
    return data


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^a-z0-9_]+", "", value)
    value = re.sub(r"_+", "_", value)
    return value.strip("_")


def _parse_direction_list(value: str) -> list[str]:
    raw = [part.strip() for part in value.split(",")]
    return [part for part in raw if part]


def _label_crop_for_block(
    image_bgr: np.ndarray,
    magenta_mask: np.ndarray,
    x: int,
    y: int,
    bw: int,
    bh: int,
    shrink_px: int,
    label_height: int,
    label_width_frac: float,
    label_y_offset: int,
) -> np.ndarray:
    h, w = image_bgr.shape[:2]

    x0 = int(max(0, x - shrink_px))
    x1 = int(min(w, x + bw + shrink_px))

    label_height = int(max(8, label_height))
    label_y_offset = int(label_y_offset)

    # Only look for the bottom magenta boundary BELOW the block.
    # Searching above can accidentally pick up magenta inside a busy block.
    search_y0 = int(min(h - 1, max(0, y + bh)))
    search_y1 = int(min(h, search_y0 + max(24, label_y_offset + label_height + 16)))

    region = magenta_mask[search_y0:search_y1, x0:x1]
    bottom_line_y = int(y + bh)
    if region.size > 0:
        row_counts = np.sum(region > 0, axis=1)
        # Bottom boundary line spans most of the block width.
        # Use a high threshold so we don't mistake magenta label text as the boundary.
        threshold = max(8, int((x1 - x0) * 0.6))

        candidates = np.where(row_counts >= threshold)[0]
        if candidates.size > 0:
            # first magenta-heavy row below the block
            bottom_line_y = int(search_y0 + int(candidates.min()))

    # Skip the thickness of the bottom magenta boundary band (it can be >1px).
    # This ensures the label crop starts below the separator line.
    line_end_y = int(bottom_line_y)
    for yy in range(int(bottom_line_y), int(min(h, bottom_line_y + 12))):
        row = magenta_mask[yy:yy + 1, x0:x1]
        if row.size == 0:
            break
        if int(np.count_nonzero(row)) >= max(8, int((x1 - x0) * 0.6)):
            line_end_y = yy
        else:
            break

    label_start_y = int(min(h, line_end_y + 1 + int(label_y_offset)))

    # Stop the label crop at the next magenta separator (top of the next block),
    # otherwise we can accidentally include sprites below the label.
    next_line_y: Optional[int] = None
    next_search_y0 = int(min(h - 1, max(0, label_start_y)))
    next_search_y1 = int(min(h, next_search_y0 + max(16, label_height + 24)))
    next_region = magenta_mask[next_search_y0:next_search_y1, x0:x1]
    if next_region.size > 0:
        next_row_counts = np.sum(next_region > 0, axis=1)
        next_threshold = max(8, int((x1 - x0) * 0.6))
        next_candidates = np.where(next_row_counts >= next_threshold)[0]
        if next_candidates.size > 0:
            next_line_y = int(next_search_y0 + int(next_candidates.min()))

    label_width_frac = float(max(0.1, min(1.0, label_width_frac)))

    lx0 = int(max(0, x0))
    lx1 = int(min(w, lx0 + int(round((x1 - x0) * label_width_frac))))

    ly0 = int(label_start_y)

    if next_line_y is not None and next_line_y > ly0:
        ly1 = int(min(h, next_line_y))
    else:
        ly1 = int(min(h, ly0 + label_height))

    if ly1 <= ly0 or lx1 <= lx0:
        return np.zeros((1, 1, 3), dtype=np.uint8)

    crop = image_bgr[ly0:ly1, lx0:lx1]

    # Strip any full-width magenta separator line(s) from the top of the crop.
    # This improves legibility for OCR and avoids including a big magenta bar.
    crop_h, crop_w = crop.shape[:2]
    if crop_h > 2 and crop_w > 8:
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        lower = np.array([140, 80, 80], dtype=np.uint8)
        upper = np.array([170, 255, 255], dtype=np.uint8)
        mm = cv2.inRange(hsv, lower, upper)
        row_counts = np.sum(mm > 0, axis=1)
        threshold = max(4, int(crop_w * 0.35))

        max_scan = int(min(10, crop_h))

        first_magenta: Optional[int] = None
        for i in range(max_scan):
            if int(row_counts[i]) >= threshold:
                first_magenta = i
                break

        if first_magenta is not None:
            last_magenta = first_magenta
            for i in range(first_magenta + 1, max_scan):
                if int(row_counts[i]) >= threshold:
                    last_magenta = i
                else:
                    break

            # Only strip if the magenta band starts at the very top of the crop.
            # If it starts lower, the rows above may include the actual label text.
            if first_magenta == 0:
                cut = last_magenta + 1
                if cut > 0 and crop_h - cut >= 1:
                    crop = crop[cut:, :]

    return crop


def _ocr_label_text(label_bgr: np.ndarray) -> Optional[str]:
    tesseract = which("tesseract")
    if tesseract is None:
        return None

    gray = cv2.cvtColor(label_bgr, cv2.COLOR_BGR2GRAY)
    # boost contrast for small text
    gray = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # write a temporary file next to the process working directory
    tmp_path = Path(".label_ocr_tmp.png").resolve()
    cv2.imwrite(str(tmp_path), bw)

    try:
        res = subprocess.run(
            [tesseract, str(tmp_path), "stdout", "--psm", "7"],
            check=False,
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            return None
        text_out = res.stdout.strip()
        if not text_out:
            return None
        return text_out
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


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


def _filter_candidate_boxes_open_guides(
    image_bgr: np.ndarray,
    magenta_mask: np.ndarray,
    shrink_px: int,
    min_area: int,
    min_sprite_pixels: int,
    open_v_len: int,
    open_group_y_tol: int,
) -> list[tuple[int, int, int, int]]:
    h, w = image_bgr.shape[:2]
    shrink_px = int(max(0, shrink_px))

    open_v_len = int(max(8, open_v_len))
    open_group_y_tol = int(max(1, open_group_y_tol))

    # The open-guide sheet uses bottom horizontal magenta lines and right-side vertical magenta lines.
    # Those lines may be discontinuous, so we use 1D closing to bridge small gaps.
    mag = (magenta_mask > 0).astype(np.uint8)

    sprite_mask = _sprite_mask(image_bgr)

    def close_1d(arr: np.ndarray, k: int, vertical: bool) -> np.ndarray:
        k = int(max(1, k))
        if vertical:
            ker = cv2.getStructuringElement(cv2.MORPH_RECT, (1, k))
        else:
            ker = cv2.getStructuringElement(cv2.MORPH_RECT, (k, 1))
        out = cv2.morphologyEx(arr, cv2.MORPH_CLOSE, ker, iterations=1)
        return out

    # Detect horizontal bottom-line candidates.
    # We find rows with long magenta runs after closing.
    h_close = close_1d(mag, k=21, vertical=False)
    row_counts = np.sum(h_close > 0, axis=1)

    # Keep rows that have enough magenta pixels to represent a bottom line.
    # Threshold is relative to image width (lines are long).
    row_thr = max(60, int(w * 0.10))
    candidate_rows = np.where(row_counts >= row_thr)[0].tolist()

    if not candidate_rows:
        return []

    # Group candidate rows by y (line thickness / jitter).
    candidate_rows.sort()
    row_groups: list[list[int]] = []
    for y in candidate_rows:
        if not row_groups or abs(int(y) - int(row_groups[-1][-1])) > open_group_y_tol:
            row_groups.append([int(y)])
        else:
            row_groups[-1].append(int(y))

    bottom_lines: list[int] = [int(round(np.median(g))) for g in row_groups]

    # Detect vertical boundary columns by scanning columns for long magenta runs after closing.
    v_close = close_1d(mag, k=15, vertical=True)
    col_counts = np.sum(v_close > 0, axis=0)

    # Candidate boundary columns must have a lot of magenta pixels.
    col_thr = max(30, int(h * 0.02))
    candidate_cols = np.where(col_counts >= col_thr)[0].tolist()
    candidate_cols.sort()

    # Deduplicate near columns (thickness).
    boundary_cols: list[int] = []
    for x in candidate_cols:
        if not boundary_cols or abs(int(x) - int(boundary_cols[-1])) > 2:
            boundary_cols.append(int(x))

    if not boundary_cols:
        return []

    # For each boundary column, estimate its vertical extent (top Y).
    # We'll use this to infer block tops.
    boundary_tops: dict[int, int] = {}
    for x in boundary_cols:
        col = v_close[:, x]
        ys = np.where(col > 0)[0]
        if ys.size == 0:
            continue
        boundary_tops[x] = int(ys.min())

    # Helper to find horizontal line segments at a given y.
    def horizontal_segments_at_y(y: int) -> list[tuple[int, int]]:
        row = h_close[y, :]
        segs: list[tuple[int, int]] = []
        in_seg = False
        start = 0
        for x in range(w):
            on = bool(row[x])
            if on and not in_seg:
                in_seg = True
                start = x
            if not on and in_seg:
                end = x
                if end - start >= max(50, int(w * 0.02)):
                    segs.append((int(start), int(end)))
                in_seg = False
        if in_seg:
            end = w
            if end - start >= max(50, int(w * 0.02)):
                segs.append((int(start), int(end)))
        return segs

    boxes: list[tuple[int, int, int, int]] = []

    # For each bottom line, partition its horizontal segments by boundary columns.
    for bottom_y in bottom_lines:
        segs = horizontal_segments_at_y(int(bottom_y))
        if not segs:
            continue

        for (seg_x0, seg_x1) in segs:
            # boundaries within this bottom segment define right edges.
            rights = [x for x in boundary_cols if seg_x0 + 2 <= x <= seg_x1 - 2]
            if not rights:
                continue

            prev_x = int(seg_x0)
            for x_right in rights:
                x_left = int(prev_x)

                # If there's no explicit left boundary line, we still use the bottom segment start.
                y_top = boundary_tops.get(int(x_right))
                if y_top is None:
                    prev_x = int(x_right)
                    continue

                x1 = int(x_left + shrink_px)
                x2 = int(x_right - shrink_px)
                y1 = int(y_top + shrink_px)
                y2 = int(bottom_y - shrink_px)

                if x2 <= x1 or y2 <= y1:
                    prev_x = int(x_right)
                    continue

                bw = int(x2 - x1)
                bh = int(y2 - y1)

                if int(bw * bh) < int(min_area):
                    prev_x = int(x_right)
                    continue

                region_sprite = sprite_mask[y1:y2, x1:x2]
                if int(np.count_nonzero(region_sprite)) < int(min_sprite_pixels):
                    prev_x = int(x_right)
                    continue

                boxes.append((x1, y1, bw, bh))
                prev_x = int(x_right)

    boxes.sort(key=lambda b: (b[1], b[0]))
    return boxes


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
    guide_mode: str,
    open_v_len: int,
    open_group_y_tol: int,
    export_frames: bool,
    export_frames_flat: bool,
    frames_trim: bool,
    frames_alpha_threshold: int,
    frames_trim_pad: int,
    frames_map: Optional[dict],
    frames_map_strict: bool,
    export_labels: bool,
    label_height: int,
    label_width_frac: float,
    label_y_offset: int,
    label_ocr: bool,
    write_frames_map: Optional[Path],
    frames_map_default_directions: list[str],
) -> tuple[list[BlockInfo], Path]:
    image = _read_image(input_path)
    image_bgr = _bgr(image)

    magenta_mask = _magenta_mask(image_bgr)

    guide_mode = str(guide_mode)
    if guide_mode not in {"closed", "open", "auto"}:
        raise ValueError("guide_mode must be one of: closed, open, auto")

    boxes: list[tuple[int, int, int, int]] = []

    if guide_mode in {"closed", "auto"}:
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

    if guide_mode == "open" or (guide_mode == "auto" and len(boxes) < 6):
        boxes = _filter_candidate_boxes_open_guides(
            image_bgr=image_bgr,
            magenta_mask=magenta_mask,
            shrink_px=shrink_px,
            min_area=min_area,
            min_sprite_pixels=min_sprite_pixels,
            open_v_len=open_v_len,
            open_group_y_tol=open_group_y_tol,
        )

    blocks_dir = out_dir / "blocks"
    _ensure_dir(blocks_dir)

    frames_dir = out_dir / "frames"
    if export_frames:
        _ensure_dir(frames_dir)

    labels_dir = out_dir / "labels"
    if export_labels:
        _ensure_dir(labels_dir)

    autogen_blocks_map: dict[str, dict] = {}

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

        if export_labels or write_frames_map is not None:
            label_crop = _label_crop_for_block(
                image_bgr=image_bgr,
                magenta_mask=magenta_mask,
                x=int(x),
                y=int(y),
                bw=int(bw),
                bh=int(bh),
                shrink_px=int(shrink_px),
                label_height=int(label_height),
                label_width_frac=float(label_width_frac),
                label_y_offset=int(label_y_offset),
            )

            label_file_rel = None
            if export_labels:
                label_filename = f"{key}.png"
                label_path = labels_dir / label_filename
                cv2.imwrite(str(label_path), label_crop)
                label_file_rel = f"labels/{label_filename}"

            label_text_raw: Optional[str] = None
            label_name: Optional[str] = None

            if label_ocr:
                label_text_raw = _ocr_label_text(label_crop)
                if label_text_raw is not None:
                    label_name = _slugify(label_text_raw)

            if write_frames_map is not None:
                entry: dict = {
                    "name": label_name or "",
                    "colStart": 0,
                    "colEnd": None,
                    "frameIndexPad": 3,
                }

                if label_file_rel is not None:
                    entry["labelFile"] = label_file_rel
                if label_text_raw is not None:
                    entry["labelText"] = label_text_raw

                if len(frames_map_default_directions) == int(rows):
                    entry["directions"] = list(frames_map_default_directions)
                elif len(frames_map_default_directions) >= int(rows) and int(rows) > 1:
                    entry["directions"] = list(frames_map_default_directions[: int(rows)])

                autogen_blocks_map[key] = entry

        if export_frames:
            if export_frames_flat:
                block_frames_dir = frames_dir
            else:
                block_frames_dir = frames_dir / key
                _ensure_dir(block_frames_dir)

            block_map: Optional[dict] = None
            if frames_map is not None:
                blocks_map = frames_map.get("blocks")
                if isinstance(blocks_map, dict):
                    candidate = blocks_map.get(key)
                    if candidate is not None:
                        if not isinstance(candidate, dict):
                            raise ValueError(f"frames map entry for {key} must be an object")
                        block_map = candidate

            if block_map is None and key in autogen_blocks_map:
                block_map = autogen_blocks_map.get(key)

            if frames_map_strict and block_map is None and frames_map is not None:
                raise ValueError(f"frames map is missing entry for {key}")

            anim_name: Optional[str] = None
            directions: Optional[list[str]] = None
            col_start = 0
            col_end: Optional[int] = None
            frame_index_pad = 3

            if block_map is not None:
                anim_name_value = block_map.get("name")
                if anim_name_value is None:
                    anim_name = None
                elif not isinstance(anim_name_value, str):
                    raise ValueError(f"frames map entry for {key} 'name' must be a string")
                else:
                    anim_name_value = anim_name_value.strip()
                    anim_name = anim_name_value if anim_name_value else None

                raw_dirs = block_map.get("directions")
                if raw_dirs is not None:
                    if not isinstance(raw_dirs, list) or not all(isinstance(d, str) for d in raw_dirs):
                        raise ValueError(f"frames map entry for {key} 'directions' must be string[]")
                    directions = raw_dirs

                if "colStart" in block_map:
                    col_start = int(block_map.get("colStart"))
                if "colEnd" in block_map:
                    col_end_val = block_map.get("colEnd")
                    col_end = int(col_end_val) if col_end_val is not None else None

                if "frameIndexPad" in block_map:
                    frame_index_pad = int(block_map.get("frameIndexPad"))

                if directions is not None and len(directions) != int(rows):
                    raise ValueError(
                        f"frames map entry for {key} directions length must equal rows ({rows})"
                    )

            for row in range(int(rows)):
                for col in range(int(cols)):
                    if col < col_start:
                        continue
                    if col_end is not None and col > int(col_end):
                        continue

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

                    if anim_name is not None:
                        dir_name = directions[row] if directions is not None else ""
                        frame_idx = col - col_start
                        idx_str = str(frame_idx).zfill(max(1, frame_index_pad))

                        if dir_name:
                            frame_name = f"{anim_name}_{dir_name}_{idx_str}.png"
                        else:
                            frame_name = f"{anim_name}_{idx_str}.png"
                    else:
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

    if write_frames_map is not None:
        frames_map_out = {
            "blocks": autogen_blocks_map,
        }
        write_frames_map.write_text(json.dumps(frames_map_out, indent=2) + "\n")

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
        "--guide-mode",
        choices=["closed", "open", "auto"],
        default="closed",
        help="How to interpret magenta guides: 'closed' expects fully boxed guides; 'open' expects bottom + vertical right guides; 'auto' tries closed then falls back to open",
    )
    parser.add_argument(
        "--open-v-len",
        type=int,
        default=40,
        help="(open guide mode) minimum vertical guide length in pixels",
    )
    parser.add_argument(
        "--open-group-y-tol",
        type=int,
        default=4,
        help="(open guide mode) tolerance for grouping vertical boundaries by bottom-line Y",
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
    parser.add_argument(
        "--frames-map",
        default=None,
        help="Path to JSON mapping file that assigns block_XXX -> animation name + row directions for naming exported frames",
    )
    parser.add_argument(
        "--frames-map-strict",
        action="store_true",
        help="Fail if any detected block is missing from --frames-map",
    )
    parser.add_argument(
        "--export-labels",
        action="store_true",
        help="Export cropped label images per block to help build frames-map (out_dir/labels/block_XXX.png)",
    )
    parser.add_argument(
        "--label-height",
        type=int,
        default=28,
        help="Label crop height in pixels (used with --export-labels and --write-frames-map)",
    )
    parser.add_argument(
        "--label-width-frac",
        type=float,
        default=0.6,
        help="Label crop width as a fraction of the block width (0..1)",
    )
    parser.add_argument(
        "--label-y-offset",
        type=int,
        default=2,
        help="Pixels below the detected bottom magenta line to start the label crop",
    )
    parser.add_argument(
        "--label-ocr",
        action="store_true",
        help="Attempt OCR of label crops using the 'tesseract' CLI if installed",
    )
    parser.add_argument(
        "--write-frames-map",
        default=None,
        help="Write an auto-generated frames-map JSON to this path (uses OCR name if available; otherwise blank names)",
    )
    parser.add_argument(
        "--frames-map-default-directions",
        default="up_right,right,down_right,down_left,left,up_left",
        help="Comma-separated directions to use when auto-generating frames-map entries (applied if rows match)",
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

    frames_map: Optional[dict] = None
    if args.frames_map is not None:
        frames_map = _read_frames_map(Path(args.frames_map).resolve())

    write_frames_map: Optional[Path] = None
    if args.write_frames_map is not None:
        write_frames_map = Path(args.write_frames_map).resolve()

    default_dirs = _parse_direction_list(str(args.frames_map_default_directions))

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
        guide_mode=str(args.guide_mode),
        open_v_len=int(args.open_v_len),
        open_group_y_tol=int(args.open_group_y_tol),
        export_frames=bool(args.export_frames),
        export_frames_flat=bool(args.export_frames_flat),
        frames_trim=bool(args.frames_trim),
        frames_alpha_threshold=int(args.frames_alpha_threshold),
        frames_trim_pad=int(args.frames_trim_pad),
        frames_map=frames_map,
        frames_map_strict=bool(args.frames_map_strict),
        export_labels=bool(args.export_labels),
        label_height=int(args.label_height),
        label_width_frac=float(args.label_width_frac),
        label_y_offset=int(args.label_y_offset),
        label_ocr=bool(args.label_ocr),
        write_frames_map=write_frames_map,
        frames_map_default_directions=list(default_dirs),
    )

    needs_review = sum(1 for b in blocks if b.needsReview)

    print(f"Extracted {len(blocks)} blocks")
    print(f"Manifest: {manifest_path}")
    print(f"Blocks needing review: {needs_review}")


if __name__ == "__main__":
    main()
