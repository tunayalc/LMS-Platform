from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

import base64
import cv2
import numpy as np


# ═══════════════════════════════════════════════════════════════════════════════
# FORM LAYOUT CONFIGURATION
# Calibrated for Turkish 156-question OMR form (3 columns x 52 questions, A-E)
# IMPORTANT: These coordinates are for the PERSPECTIVE-CORRECTED, RESIZED image
# The answer grid is on the RIGHT SIDE of the form after cropping
# ═══════════════════════════════════════════════════════════════════════════════

FORM_LAYOUT = {
    # Calibrated from user blue markers on a 2000px-wide resized image.
    # Reference image: omr_debug_t028.jpg (2000x2715 after resize).
    # Top markers y≈0.09734, bottom markers y≈0.94994 (52 rows => 51 intervals).
    "columns": [
        # Column 1 (Q1-52): A..E span from blue markers.
        {"startX": 0.5577, "endX": 0.6524, "questionsStart": 1, "questionsCount": 52},
        # Column 2 (Q53-104): A..E span from blue markers.
        {"startX": 0.6975, "endX": 0.7919, "questionsStart": 53, "questionsCount": 52},
        # Column 3 (Q105-156): A..E span from blue markers.
        {"startX": 0.838925, "endX": 0.932625, "questionsStart": 105, "questionsCount": 52},
    ],
    "startYRatio": 0.0973419276,
    "rowHeightRatio": 0.0167177024,
    # Bubble radius tuned to ~19-20px on a 2000px-wide image.
    "bubbleRadiusRatio": 0.01,
    "options": ["A", "B", "C", "D", "E"],
    # Detection thresholds (tuned for grayscale-ring fill metric)
    "minRelativeRatio": 0.22,
    "minGapRatio": 0.08,
}

def _read_exif_orientation(image_bytes: bytes) -> Optional[int]:
    """
    Minimal JPEG EXIF orientation reader.
    Returns 1,2,3,4,5,6,7,8 or None if not found/unsupported.
    """
    if len(image_bytes) < 4 or image_bytes[0:2] != b"\xFF\xD8":
        return None

    i = 2
    length = len(image_bytes)
    while i + 4 <= length:
        if image_bytes[i] != 0xFF:
            break
        marker = image_bytes[i + 1]
        i += 2

        # Start of scan or end of image -> stop parsing segments
        if marker in (0xDA, 0xD9):
            break
        if i + 2 > length:
            break
        seg_len = int.from_bytes(image_bytes[i : i + 2], "big", signed=False)
        if seg_len < 2:
            break
        seg_start = i + 2
        seg_end = i + seg_len
        if seg_end > length:
            break

        # APP1 EXIF segment
        if marker == 0xE1 and seg_end - seg_start >= 10:
            header = image_bytes[seg_start : seg_start + 6]
            if header == b"Exif\x00\x00":
                tiff = image_bytes[seg_start + 6 : seg_end]
                if len(tiff) < 8:
                    return None

                endian = tiff[0:2]
                if endian == b"II":
                    byte_order = "little"
                elif endian == b"MM":
                    byte_order = "big"
                else:
                    return None

                # 0x2A fixed
                if int.from_bytes(tiff[2:4], byte_order) != 0x2A:
                    return None

                ifd0_offset = int.from_bytes(tiff[4:8], byte_order)
                if ifd0_offset + 2 > len(tiff):
                    return None
                num_entries = int.from_bytes(tiff[ifd0_offset : ifd0_offset + 2], byte_order)
                entry_base = ifd0_offset + 2
                for n in range(num_entries):
                    entry_off = entry_base + n * 12
                    if entry_off + 12 > len(tiff):
                        break
                    tag = int.from_bytes(tiff[entry_off : entry_off + 2], byte_order)
                    if tag != 0x0112:
                        continue
                    typ = int.from_bytes(tiff[entry_off + 2 : entry_off + 4], byte_order)
                    count = int.from_bytes(tiff[entry_off + 4 : entry_off + 8], byte_order)
                    value = tiff[entry_off + 8 : entry_off + 12]
                    # Orientation is usually SHORT (3), count 1; value in first 2 bytes.
                    if typ == 3 and count == 1 and len(value) >= 2:
                        return int.from_bytes(value[0:2], byte_order)
                    return None

        i = seg_end

    return None


def _apply_exif_orientation(image: np.ndarray, orientation: int) -> np.ndarray:
    # 1 = Normal
    if orientation == 1:
        return image
    # 2 = Mirrored horizontal
    if orientation == 2:
        return cv2.flip(image, 1)
    # 3 = Rotated 180
    if orientation == 3:
        return cv2.rotate(image, cv2.ROTATE_180)
    # 4 = Mirrored vertical
    if orientation == 4:
        return cv2.flip(image, 0)
    # 5 = Mirrored horizontal then rotated 90 CCW (transpose)
    if orientation == 5:
        return cv2.rotate(cv2.flip(image, 1), cv2.ROTATE_90_COUNTERCLOCKWISE)
    # 6 = Rotated 90 CW
    if orientation == 6:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    # 7 = Mirrored horizontal then rotated 90 CW (transverse)
    if orientation == 7:
        return cv2.rotate(cv2.flip(image, 1), cv2.ROTATE_90_CLOCKWISE)
    # 8 = Rotated 90 CCW
    if orientation == 8:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return image


def _detect_bubbles_hough(gray: np.ndarray) -> List[Tuple[int, int, int]]:
    """
    Detect circles (bubbles) in the image using HoughCircles.
    Returns list of (x, y, radius) tuples.
    """
    # Match OmrPanel.tsx parameters
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    height, width = gray.shape[:2]
    
    # Dynamic radius based on image size (bubbles are ~1-2% of width)
    min_radius = max(5, int(width * 0.008))
    max_radius = max(15, int(width * 0.020))
    min_dist = max(12, int(width * 0.015))
    
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min_dist,
        param1=120,
        param2=28,
        minRadius=min_radius,
        maxRadius=max_radius
    )
    
    if circles is None:
        print("[OMR-Python] HoughCircles found 0 bubbles")
        return []
    
    circles = np.uint16(np.around(circles))
    result = [(int(c[0]), int(c[1]), int(c[2])) for c in circles[0]]
    print(f"[OMR-Python] HoughCircles found {len(result)} bubbles")
    return result


def _derive_grid_from_bubbles(bubbles: List[Tuple[int, int, int]], width: int, height: int) -> Optional[dict]:
    """
    Derive column/row grid from detected bubble positions.
    Returns dict with columns info or None if can't derive.
    """
    if len(bubbles) < 50:
        print(f"[OMR-Python] Not enough bubbles ({len(bubbles)}) to derive grid")
        return None
    
    # Extract X and Y coordinates
    xs = np.array([b[0] for b in bubbles])
    ys = np.array([b[1] for b in bubbles])
    
    # Find distinct Y positions (rows) using clustering
    y_sorted = np.sort(np.unique(np.round(ys / 10) * 10))
    
    # Find distinct X positions for columns - expect 5 bubbles per column group (A-E)
    x_sorted = np.sort(xs)
    
    # Cluster X positions to find column groups
    # We expect 3 groups of 5 (for 3 answer columns)
    x_diff = np.diff(x_sorted)
    large_gaps = np.where(x_diff > width * 0.05)[0]
    
    print(f"[OMR-Python] X range: {xs.min():.0f} - {xs.max():.0f}")
    print(f"[OMR-Python] Y range: {ys.min():.0f} - {ys.max():.0f}")
    print(f"[OMR-Python] Found {len(large_gaps)} column separators")
    
    # For now, return the detected X/Y ranges as ratios
    return {
        "x_min": float(xs.min()) / width,
        "x_max": float(xs.max()) / width,
        "y_min": float(ys.min()) / height,
        "y_max": float(ys.max()) / height,
        "bubble_count": len(bubbles)
    }


def _derive_layout_from_circles(gray: np.ndarray) -> Optional[Dict[str, Any]]:
    """
    Detect bubbles using HoughCircles and derive the form layout dynamically.
    This eliminates the need for hardcoded FORM_LAYOUT coordinates.
    """
    height, width = gray.shape[:2]
    
    # Detect all circular bubbles
    bubbles = _detect_bubbles_hough(gray)
    
    if len(bubbles) < 100:
        print(f"[OMR-Python] Smart align: only {len(bubbles)} bubbles, need at least 100")
        return None
    
    # Get bubble stats
    grid_info = _derive_grid_from_bubbles(bubbles, width, height)
    if not grid_info:
        return None
    
    # Use detected bubble positions to update layout
    # Return a layout dict that can override FORM_LAYOUT columns
    x_min = grid_info["x_min"]
    x_max = grid_info["x_max"]
    y_min = grid_info["y_min"]
    y_max = grid_info["y_max"]
    
    # Estimate: 3 columns of 5 options each across the X range
    x_span = x_max - x_min
    col_width = x_span / 3  # 3 answer columns
    opt_width = col_width * 0.9 / 1  # A-E options within column
    
    # Build dynamic columns
    columns = []
    for i in range(3):
        col_start = x_min + i * col_width + col_width * 0.05
        col_end = col_start + opt_width
        columns.append({
            "startX": col_start,
            "endX": col_end,
            "questionsStart": 1 + i * 52,
            "questionsCount": 52
        })
    
    print(f"[OMR-Python] Derived columns: {columns}")
    
    return {
        "columns": columns,
        "startYRatio": y_min,
        "rowHeightRatio": (y_max - y_min) / 52,
    }



def _decode_image(image_bytes: bytes) -> np.ndarray:
    buffer = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("invalid_image_data")
    orientation = _read_exif_orientation(image_bytes)
    if orientation and orientation != 1:
        try:
            image = _apply_exif_orientation(image, orientation)
            print(f"[OMR-Python] Applied EXIF orientation: {orientation}")
        except Exception as exc:
            print(f"[OMR-Python] Failed to apply EXIF orientation ({orientation}): {exc}")
    return image


def _order_points(points: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = points.sum(axis=1)
    rect[0] = points[np.argmin(s)]
    rect[2] = points[np.argmax(s)]
    diff = np.diff(points, axis=1)
    rect[1] = points[np.argmin(diff)]
    rect[3] = points[np.argmax(diff)]
    return rect


def _find_corners_by_harris(gray: np.ndarray) -> Optional[np.ndarray]:
    """
    Fallback corner detection using Harris corners.
    Looks for strong corners in each quadrant of the image.
    """
    height, width = gray.shape[:2]
    
    # Harris corner detection
    gray_float = np.float32(gray)
    harris = cv2.cornerHarris(gray_float, blockSize=5, ksize=5, k=0.04)
    harris = cv2.dilate(harris, None)
    
    # Threshold for corner strength
    threshold = 0.01 * harris.max()
    corner_points = np.argwhere(harris > threshold)
    
    if len(corner_points) < 4:
        return None
    
    # Divide image into quadrants and find strongest corner in each
    quadrants = [
        (0, 0, width // 2, height // 2),           # Top-left
        (width // 2, 0, width, height // 2),       # Top-right
        (0, height // 2, width // 2, height),      # Bottom-left
        (width // 2, height // 2, width, height),  # Bottom-right
    ]
    
    best_corners = []
    for x1, y1, x2, y2 in quadrants:
        # Filter corners in this quadrant (note: argwhere returns [y, x])
        in_quad = corner_points[
            (corner_points[:, 1] >= x1) & (corner_points[:, 1] < x2) &
            (corner_points[:, 0] >= y1) & (corner_points[:, 0] < y2)
        ]
        if len(in_quad) == 0:
            return None
        # Find the corner with strongest Harris response
        strengths = [harris[pt[0], pt[1]] for pt in in_quad]
        best_idx = np.argmax(strengths)
        best_pt = in_quad[best_idx]
        best_corners.append((float(best_pt[1]), float(best_pt[0])))  # Convert to (x, y)
    
    points = np.array(best_corners, dtype="float32")
    return _order_points(points)


def _find_black_square_in_region(gray: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> Optional[Tuple[float, float]]:
    """
    Find the center of a black square marker within a specified region.
    Tries multiple threshold methods for robustness.
    Returns (cx, cy) or None if not found.
    """
    region = gray[y1:y2, x1:x2]
    if region.size == 0:
        return None
    
    region_area = (x2 - x1) * (y2 - y1)
    
    # Try multiple thresholding methods
    thresholding_methods = [
        # Otsu - usually best for bimodal images
        lambda r: cv2.threshold(r, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1],
        # Fixed threshold for very dark squares
        lambda r: cv2.threshold(r, 100, 255, cv2.THRESH_BINARY_INV)[1],
        # Lower threshold
        lambda r: cv2.threshold(r, 60, 255, cv2.THRESH_BINARY_INV)[1],
        # Adaptive threshold
        lambda r: cv2.adaptiveThreshold(cv2.GaussianBlur(r, (5,5), 0), 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 8),
    ]
    
    best_candidate = None
    best_score = 0
    
    for thresh_fn in thresholding_methods:
        try:
            thresh = thresh_fn(region)
        except:
            continue
        
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            # Black square: 0.5% to 20% of search region
            if area < region_area * 0.005 or area > region_area * 0.20:
                continue
            
            x, y, w, h = cv2.boundingRect(contour)
            if w < 5 or h < 5:  # Too small
                continue
            
            # Square-ish shape (aspect ratio 0.6 to 1.6)
            ratio = w / float(h)
            if ratio < 0.6 or ratio > 1.6:
                continue
            
            # Solidity check - should be mostly filled
            hull = cv2.convexHull(contour)
            hull_area = cv2.contourArea(hull)
            if hull_area == 0:
                continue
            solidity = area / hull_area
            if solidity < 0.7:
                continue
            
            # Score by area * solidity
            score = area * solidity
            if score > best_score:
                best_score = score
                cx = x1 + x + w / 2.0
                cy = y1 + y + h / 2.0
                best_candidate = (cx, cy)
    
    return best_candidate



def _find_marker_corners(gray: np.ndarray) -> Optional[np.ndarray]:
    """
    Find 4 black square markers at corners by searching each quadrant.
    """
    height, width = gray.shape[:2]
    print(f"[OMR-Python] Image size: {width}x{height}")
    
    # Define search regions for each corner (25% of image from each corner)
    corner_size_w = int(width * 0.25)
    corner_size_h = int(height * 0.25)
    
    search_regions = {
        'tl': (0, 0, corner_size_w, corner_size_h),
        'tr': (width - corner_size_w, 0, width, corner_size_h),
        'bl': (0, height - corner_size_h, corner_size_w, height),
        'br': (width - corner_size_w, height - corner_size_h, width, height),
    }
    
    corners = {}
    for name, (x1, y1, x2, y2) in search_regions.items():
        found = _find_black_square_in_region(gray, x1, y1, x2, y2)
        if found:
            corners[name] = found
            print(f"[OMR-Python] Found {name} corner at ({found[0]:.0f}, {found[1]:.0f})")
        else:
            print(f"[OMR-Python] Could not find {name} corner marker in region ({x1},{y1})-({x2},{y2})")
    
    if len(corners) == 4:
        points = np.array([
            corners['tl'],
            corners['tr'],
            corners['br'],
            corners['bl'],
        ], dtype="float32")
        print(f"[OMR-Python] All 4 corners found! Points: {points.tolist()}")
        return _order_points(points)
    
    print(f"[OMR-Python] Only found {len(corners)}/4 corners, trying document edge detection...")
    # Don't use Harris - it's not reliable. Go straight to document edge detection.
    return None



def _find_document_corners(gray: np.ndarray) -> Optional[np.ndarray]:
    """
    Find document corners using the proven OmrPanel.tsx algorithm:
    Canny edge detection → Find biggest contour → approxPolyDP for 4 corners
    """
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Mobile photos vary a lot; try multiple edge settings and contours.
    canny_pairs = [(60, 180), (40, 140), (30, 120), (20, 100)]
    epsilons = [0.02, 0.015, 0.025, 0.03, 0.04]

    height, width = gray.shape[:2]
    min_area = float(width * height) * 0.20

    for t1, t2 in canny_pairs:
        edged = cv2.Canny(blurred, t1, t2)
        edged = cv2.dilate(edged, None, iterations=2)
        edged = cv2.erode(edged, None, iterations=1)

        contours, _ = cv2.findContours(edged, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:12]

        for contour in contours:
            area = cv2.contourArea(contour)
            if area < min_area:
                continue

            perimeter = cv2.arcLength(contour, True)
            if perimeter <= 0:
                continue

            for eps in epsilons:
                approx = cv2.approxPolyDP(contour, eps * perimeter, True)
                if len(approx) == 4:
                    corners = approx.reshape(4, 2).astype("float32")
                    print(
                        f"[OMR-Python] Found 4-corner document (canny={t1},{t2} eps={eps}) area={area:.0f}"
                    )
                    return _order_points(corners)

    print("[OMR-Python] Document corner detection failed")
    return None



def _warp_perspective(image: np.ndarray, corners: np.ndarray) -> np.ndarray:
    (tl, tr, br, bl) = corners
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_width = max(int(width_a), int(width_b))
    max_height = max(int(height_a), int(height_b))
    if max_width < 50 or max_height < 50:
        return image
    dst = np.array(
        [
            [0, 0],
            [max_width - 1, 0],
            [max_width - 1, max_height - 1],
            [0, max_height - 1],
        ],
        dtype="float32",
    )
    transform = cv2.getPerspectiveTransform(corners, dst)
    return cv2.warpPerspective(image, transform, (max_width, max_height))


def _resize_to_width(image: np.ndarray, target_width: int = 2000) -> np.ndarray:
    height, width = image.shape[:2]
    if width == 0:
        return image
    if width == target_width:
        return image
    scale = target_width / float(width)
    target_height = max(1, int(height * scale))
    return cv2.resize(image, (target_width, target_height), interpolation=cv2.INTER_AREA)


def _normalize_answer_key(raw: Optional[Dict[str, Any]]) -> Dict[str, str]:
    if not raw:
        return {}
    normalized: Dict[str, str] = {}
    for key, value in raw.items():
        key_str = str(key)
        if key_str.lower().startswith("q_"):
            key_str = key_str[2:]
        if key_str.isdigit():
            key_str = f"q_{int(key_str)}"
        value_str = str(value).strip().upper()
        if value_str:
            normalized[key_str] = value_str[0]
    return normalized


def _cluster_1d(values: List[int], gap: int) -> List[int]:
    if not values:
        return []
    values = sorted(values)
    clusters = [[values[0]]]
    for value in values[1:]:
        if value - clusters[-1][-1] > gap:
            clusters.append([value])
        else:
            clusters[-1].append(value)
    return [int(np.mean(cluster)) for cluster in clusters]


def _derive_layout_from_circles(gray: np.ndarray) -> Optional[Dict[str, Any]]:
    blurred = cv2.medianBlur(gray, 5)
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=18,
        param1=120,
        param2=25,
        minRadius=10,
        maxRadius=20,
    )
    if circles is None:
        return None
    circles = np.round(circles[0, :]).astype(int)
    xs = [c[0] for c in circles]
    ys = [c[1] for c in circles]
    rs = [c[2] for c in circles]
    x_centers = _cluster_1d(xs, gap=8)
    y_centers = _cluster_1d(ys, gap=8)

    if len(x_centers) < 15 or len(y_centers) < 40:
        return None

    x_centers = sorted(x_centers)[-15:]
    y_centers = sorted(y_centers)

    if len(y_centers) > 52:
        best_subset = None
        for start in range(0, len(y_centers) - 52 + 1):
            subset = y_centers[start : start + 52]
            diffs = np.diff(subset)
            variance = float(np.var(diffs))
            if best_subset is None or variance < best_subset[0]:
                best_subset = (variance, subset)
        if best_subset is not None:
            y_centers = list(best_subset[1])

    if len(y_centers) != 52:
        return None

    column_groups = [x_centers[i : i + 5] for i in range(0, 15, 5)]
    radius = int(np.median(rs)) if rs else None

    return {
        "rows": y_centers,
        "columns": column_groups,
        "radius": radius,
    }


def _prepare_binary(gray: np.ndarray) -> np.ndarray:
    """
    Prepare binary image for bubble detection.
    Uses Otsu thresholding for better filled/empty separation.
    """
    # Normalize and blur
    normalized = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    blurred = cv2.GaussianBlur(normalized, (5, 5), 0)
    
    # Use Otsu thresholding - better for bimodal images (filled vs empty bubbles)
    _, binary_otsu = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # Also try adaptive as fallback
    binary_adaptive = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 25, 10
    )
    
    # Use whichever has more contrast (higher std dev)
    std_otsu = np.std(binary_otsu)
    std_adaptive = np.std(binary_adaptive)
    binary = binary_otsu if std_otsu >= std_adaptive else binary_adaptive
    
    print(f"[OMR-Debug] Binary method: {'Otsu' if std_otsu >= std_adaptive else 'Adaptive'}, std={max(std_otsu, std_adaptive):.1f}")
    
    # Light morphological cleanup
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
    
    return binary


def _bubble_mean(gray: np.ndarray, x: int, y: int, radius: int) -> float:
    height, width = gray.shape[:2]
    if x < 0 or y < 0 or x >= width or y >= height:
        return 255.0
    inner_radius = max(2, int(radius * 0.35))
    mask_inner = np.zeros((height, width), dtype=np.uint8)
    cv2.circle(mask_inner, (x, y), inner_radius, 255, -1)
    mean_inner = cv2.mean(gray, mask=mask_inner)[0]
    return float(mean_inner)


# Debug counter for logging
_fill_debug_counter = [0]

def _bubble_fill_ratio(gray: np.ndarray, x: int, y: int, radius: int) -> float:
    """
    Compute bubble "ink" score in [0..1] from grayscale using a local ring baseline.
    This is more robust than binary sampling because it avoids counting the printed
    bubble border as ink.
    """
    height, width = gray.shape[:2]
    if x < 0 or y < 0 or x >= width or y >= height:
        return 0.0

    inner_radius = max(3, int(radius * 0.35))
    ring_inner = max(inner_radius + 2, int(radius * 0.55))
    ring_outer = max(ring_inner + 2, int(radius * 0.95))

    x0 = max(0, x - ring_outer)
    y0 = max(0, y - ring_outer)
    x1 = min(width, x + ring_outer + 1)
    y1 = min(height, y + ring_outer + 1)
    roi = gray[y0:y1, x0:x1]

    cx = x - x0
    cy = y - y0

    mask_inner = np.zeros(roi.shape[:2], dtype=np.uint8)
    cv2.circle(mask_inner, (cx, cy), inner_radius, 255, -1)
    mean_inner = float(cv2.mean(roi, mask=mask_inner)[0])

    mask_ring = np.zeros(roi.shape[:2], dtype=np.uint8)
    cv2.circle(mask_ring, (cx, cy), ring_outer, 255, -1)
    cv2.circle(mask_ring, (cx, cy), ring_inner, 0, -1)
    mean_ring = float(cv2.mean(roi, mask=mask_ring)[0])

    # Darker center => more ink. Compare to local background (ring).
    ink = (mean_ring - mean_inner) / 255.0
    # Map "ink delta" into a stable [0..1] score:
    # - small deltas (printed border / noise) collapse near 0
    # - larger deltas (filled bubbles) ramp up quickly
    fill = float(np.clip((ink - 0.10) * 6.0, 0.0, 1.0))
    
    # Debug: log first 20 bubbles
    _fill_debug_counter[0] += 1
    if _fill_debug_counter[0] <= 20:
        print(
            f"[OMR-Debug] Bubble at ({x},{y}) r={radius} inner_r={inner_radius} ring={ring_inner}-{ring_outer} fill={fill:.3f}"
        )
    
    return fill


def _scan_answers(
    gray: np.ndarray,
    binary: np.ndarray,
    answer_key: Dict[str, str],
    threshold: float,
    x_offset: float,
    y_offset: float,
    debug: bool,
    layout: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, str], List[Dict[str, Any]], Dict[str, Any], Optional[str]]:
    height, width = gray.shape[:2]
    answers: Dict[str, str] = {}
    details: List[Dict[str, Any]] = []
    densities_log: List[Dict[str, Any]] = []
    debug_image = None
    overlay = None
    row_metrics: List[Dict[str, Any]] = []
    max_scores: List[float] = []
    option_baselines: Dict[str, List[float]] = {opt: [] for opt in FORM_LAYOUT["options"]}

    if debug:
        overlay = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    if layout and layout.get("radius"):
        bubble_radius = max(3, int(layout["radius"]))
    else:
        bubble_radius = max(3, int(width * FORM_LAYOUT["bubbleRadiusRatio"]))

    if layout:
        rows = layout["rows"]
        column_groups = layout["columns"]
        for col_index, option_positions in enumerate(column_groups):
            questions_start = FORM_LAYOUT["columns"][col_index]["questionsStart"]
            for row_index, y in enumerate(rows):
                question_number = questions_start + row_index
                question_id = f"q_{question_number}"
                row_densities: List[Tuple[str, float, int]] = []

                for opt_idx, option in enumerate(FORM_LAYOUT["options"]):
                    x = int(option_positions[opt_idx] + (x_offset * width))
                    yy = int(y + (y_offset * height))
                    fill = _bubble_fill_ratio(gray, x, yy, bubble_radius)
                    row_densities.append((option, fill, x))
                    option_baselines[option].append(fill)
                    if debug:
                        cv2.circle(overlay, (x, yy), 4, (0, 0, 255), 1)
                    densities_log.append(
                        {
                            "q": question_number,
                            "option": option,
                            "fill": round(fill, 4),
                        }
                    )

                scores = [item[1] for item in row_densities]
                max_scores.append(max(scores))
                row_metrics.append(
                    {
                        "question": question_number,
                        "question_id": question_id,
                        "y": int(y + (y_offset * height)),
                        "row_densities": row_densities,
                    }
                )
    else:
        for column in FORM_LAYOUT["columns"]:
            start_x = column["startX"]
            end_x = column["endX"]
            questions_start = column["questionsStart"]
            questions_count = column["questionsCount"]

            step = (end_x - start_x) / (len(FORM_LAYOUT["options"]) - 1)
            option_positions = [
                int(width * (start_x + step * idx + x_offset))
                for idx in range(len(FORM_LAYOUT["options"]))
            ]

            for row in range(questions_count):
                question_number = questions_start + row
                question_id = f"q_{question_number}"
                y = int(
                    height
                    * (
                        FORM_LAYOUT["startYRatio"]
                        + y_offset
                        + row * FORM_LAYOUT["rowHeightRatio"]
                    )
                )
                row_densities: List[Tuple[str, float, int]] = []

                for opt_idx, option in enumerate(FORM_LAYOUT["options"]):
                    x = option_positions[opt_idx]
                    fill = _bubble_fill_ratio(gray, x, y, bubble_radius)
                    row_densities.append((option, fill, x))
                    option_baselines[option].append(fill)
                    if debug:
                        cv2.circle(overlay, (x, y), 4, (0, 0, 255), 1)
                    densities_log.append(
                        {
                            "q": question_number,
                            "option": option,
                            "fill": round(fill, 4),
                        }
                    )

                scores = [item[1] for item in row_densities]
                max_scores.append(max(scores))
                row_metrics.append(
                    {
                        "question": question_number,
                        "question_id": question_id,
                        "y": y,
                        "row_densities": row_densities,
                    }
                )

    scores_array = np.array(max_scores) if max_scores else np.array([0.0])
    # Use provided threshold as the primary absolute floor for detecting marks.
    min_ink_threshold = max(0.08, min(0.9, float(threshold)))
    # Helpful diagnostics: distribution of max bubble fill per row.
    dynamic_p84 = float(np.percentile(scores_array, 84))
    baseline_map = {
        opt: float(np.median(vals)) if vals else 0.0 for opt, vals in option_baselines.items()
    }

    for row in row_metrics:
        # Higher fill => more ink => more likely selected
        raw_densities: List[Tuple[str, float, int]] = list(row["row_densities"])
        row_densities = sorted(raw_densities, key=lambda item: item[1], reverse=True)
        question_number = row["question"]
        question_id = row["question_id"]
        y = row["y"]

        top = row_densities[0]
        second = row_densities[1]
        scores = [item[1] for item in row_densities]
        
        # Use row mean (excluding the top) as baseline for comparison
        other_scores = scores[1:]
        row_mean = float(np.mean(other_scores)) if other_scores else 0.0
        
        selected = ""
        confidence = float(top[1] - second[1])
        contrast = float(top[1] - row_mean)
        
        min_relative_delta = float(FORM_LAYOUT.get("minRelativeRatio", 0.20))
        min_gap_delta = float(FORM_LAYOUT.get("minGapRatio", 0.08))

        # Mark "likely filled" bubbles for debug/calibration:
        # include any option close to the row max, to support cases where multiple bubbles are filled.
        top_fill = float(top[1])
        marked_cutoff = max(min_ink_threshold, top_fill - 0.08)
        marked_options = [
            opt for (opt, fill, _x) in raw_densities if fill >= min_ink_threshold and fill >= marked_cutoff
        ]

        # A bubble is selected if:
        # 1) It has enough ink (absolute floor)
        # 2) It's clearly separated from other options (contrast + gap)
        if top[1] >= min_ink_threshold and contrast >= min_relative_delta and confidence >= min_gap_delta:
            selected = top[0]
        else:
            # Tolerant fallback for faint marks: allow slightly below threshold if separation is strong.
            if top[1] >= max(0.05, min_ink_threshold - 0.05) and contrast >= (min_relative_delta * 1.25) and confidence >= (min_gap_delta * 1.25):
                selected = top[0]

        correct = None
        if answer_key:
            expected = answer_key.get(question_id)
            if expected is not None:
                correct = selected == expected if selected else False

        answers[question_id] = selected
        details.append(
            {
                "question": question_number,
                "selected": selected,
                "markedOptions": marked_options,
                "multipleMarks": len(marked_options) > 1,
                "correct": correct,
                "confidence": round(confidence, 4),
                "ink": round(float(top[1]), 4),
                "gap": round(confidence, 4),
                "contrast": round(contrast, 4),
            }
        )

        if debug and overlay is not None:
            if selected:
                selected_x = next((item[2] for item in row_densities if item[0] == selected), None)
                if selected_x is not None:
                    cv2.circle(overlay, (selected_x, y), 6, (0, 255, 0), 2)
            elif marked_options:
                # Show multi-marked bubbles (useful for calibration tests where multiple bubbles are filled).
                for opt, _fill, x in raw_densities:
                    if opt in marked_options:
                        cv2.circle(overlay, (x, y), 6, (0, 255, 255), 2)

    debug_payload = {
        "threshold": float(threshold),
        "minInk": round(min_ink_threshold, 4),
        "p84MaxFill": round(dynamic_p84, 4),
        "baseline": {opt: round(val, 4) for opt, val in baseline_map.items()},
        "densities": densities_log[:80],
    }

    if debug and overlay is not None:
        _, encoded = cv2.imencode(".jpg", overlay, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        debug_image = base64.b64encode(encoded.tobytes()).decode("ascii")

    return answers, details, debug_payload, debug_image


def run_pipeline(image_bytes: bytes, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    options = options or {}
    answer_key = _normalize_answer_key(options.get("answer_key"))
    threshold = float(options.get("threshold") or 0.22)
    x_offset = float(options.get("x_offset") or 0.0)
    y_offset = float(options.get("y_offset") or 0.0)
    debug = bool(options.get("debug"))
    smart_align = bool(options.get("smart_align"))
    skip_warp = bool(options.get("skip_warp"))  # Skip perspective correction
    manual_corners = options.get("manual_corners")  # User-provided corners from crop mode

    image = _decode_image(image_bytes)
    original_h, original_w = image.shape[:2]

    # Speed + robustness: do corner/marker detection on a downscaled copy, then scale corners back.
    search_image = image
    scale_factor = 1.0
    if original_w > 1400:
        search_image = _resize_to_width(image, 1200)
        scale_factor = float(original_w) / float(search_image.shape[1] or 1)

    gray_search = cv2.cvtColor(search_image, cv2.COLOR_BGR2GRAY)
    
    print(
        f"[OMR-Python] Options: skip_warp={skip_warp}, smart_align={smart_align}, threshold={threshold}, manual_corners={manual_corners is not None}"
    )

    warnings: List[str] = []
    corners = None  # Initialize to avoid UnboundLocalError
    corner_mode = "auto"
    
    # Priority: manual_corners > auto-detect > skip
    if skip_warp:
        warnings.append("warp_skipped_by_user")
        warped = image
        corner_mode = "skipped"
        print("[OMR-Python] Warp skipped by user request")
    elif manual_corners is not None:
        # User provided corners from mobile crop mode
        try:
            corners = np.array(manual_corners, dtype="float32")
            if corners.shape == (4, 2):
                corners = _order_points(corners)
                warped = _warp_perspective(image, corners)
                corner_mode = "manual"
                print("[OMR-Python] Manual corners used for perspective warp")
            else:
                warnings.append("invalid_manual_corners")
                warped = image
                corner_mode = "manual_invalid"
                print(f"[OMR-Python] Invalid manual corners shape: {corners.shape}")
        except Exception as e:
            warnings.append("manual_corners_error")
            warped = image
            corner_mode = "manual_error"
            print(f"[OMR-Python] Error using manual corners: {e}")
    else:
        markers = _find_marker_corners(gray_search)
        corners = markers if markers is not None else _find_document_corners(gray_search)
        
        if corners is None:
            warnings.append("markers_not_found")
            warped = image
            corner_mode = "not_found"
            print("[OMR-Python] No markers found, using original image")
        else:
            if scale_factor != 1.0:
                corners = corners * scale_factor
            corners = _order_points(corners.astype("float32"))
            warped = _warp_perspective(image, corners)
            corner_mode = "auto"
            print("[OMR-Python] Perspective warp applied")

    warped = _resize_to_width(warped, 2000)
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    binary = _prepare_binary(gray)

    # Smart alignment: try to derive layout from circles
    derived_layout: Optional[Dict[str, Any]] = None
    if smart_align:
        derived_layout = _derive_layout_from_circles(gray)
        if derived_layout:
            print("[OMR-Python] Smart alignment: detected bubble grid dynamically")
        else:
            warnings.append("smart_align_failed")
            print("[OMR-Python] Smart alignment failed, using fixed coordinates")

    answers, details, debug_payload, debug_image = _scan_answers(
        gray, binary, answer_key, threshold, x_offset, y_offset, debug, layout=derived_layout
    )

    marked_count = sum(1 for value in answers.values() if value)
    review_count = sum(
        1
        for item in details
        if item.get("selected") and float(item.get("confidence") or 0.0) < 0.12
    )
    ambiguous_count = sum(
        1
        for item in details
        if not item.get("selected")
        and float(item.get("ink") or 0.0) >= 0.22
        and float(item.get("contrast") or 0.0) >= 0.12
    )

    if marked_count == 0:
        warnings.append("no_marks_detected")
    elif marked_count < 15:
        warnings.append("low_marks_detected")

    if corners is None and derived_layout is None:
        warnings.append("alignment_unreliable")

    if ambiguous_count > 0:
        warnings.append("needs_review")

    score = 0
    if answer_key:
        score = sum(1 for item in details if item.get("correct"))

    result: Dict[str, Any] = {
        "score": score,
        "answers": answers,
        "details": details,
        "dimensions": {"width": gray.shape[1], "height": gray.shape[0]},
        "warnings": warnings,
        "meta": {
            "originalWidth": original_w,
            "originalHeight": original_h,
            "markersFound": corners is not None,
            "cornerMode": corner_mode,
            "cornerPoints": corners.tolist() if corners is not None else None,
            "smartAlignUsed": derived_layout is not None,
            "markedCount": marked_count,
            "reviewCount": review_count,
            "ambiguousCount": ambiguous_count,
        },
    }

    if debug:
        debug_payload["debugImage"] = debug_image
        result["debug"] = debug_payload

    return result
