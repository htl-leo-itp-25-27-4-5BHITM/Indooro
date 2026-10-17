"""Layout loading and walkable-cell rules.

Two rules are implemented, both with 1 unit = 1 m and cell (i, j) having its centre at (i+0.5, j+0.5):

* iOS rule (``walkable_cells``), mirrors Swift ``IndoorGraphBuilder.fromLayout``: beacon, entrance and
  ``type == "anchor"`` elements never block. Axis-aligned elements block floor(x)..floor(x)+max(1, ceil(w)).
  Rotated elements (rotation mod 360 != 0) block exactly the cells whose area overlaps the rotated
  rectangle (separating-axis test with the same epsilon 1e-6 as ``RotatedRectGeometry``).
* readiness rule (``readiness_walkable_cells``), mirrors Java ``StoreReadinessEvaluator.blockedCells``:
  only beacon and entrance are exempt (anchors DO block here), rotated elements block the bounding box
  of the rotated rectangle.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Any, Optional

NON_BLOCKING_TYPES = ("beacon", "entrance")
IOS_OVERLAP_EPSILON = 1e-6
JAVA_EPS = 1e-9
JAVA_CLAMP = 1e9


class LayoutError(Exception):
    """The layout file is missing, not JSON, or lacks a usable gridSize."""


@dataclass(frozen=True)
class Element:
    type: str
    id: Any
    x: float  # NaN when missing
    y: float  # NaN when missing
    width: Optional[float]
    height: Optional[float]
    rotation: Optional[float]
    category: Optional[str]
    label: Optional[str]

    @property
    def w(self) -> float:
        return 1.0 if self.width is None else self.width

    @property
    def h(self) -> float:
        return 1.0 if self.height is None else self.height

    @property
    def center(self) -> tuple[float, float]:
        return self.x + self.w / 2, self.y + self.h / 2

    @property
    def has_position(self) -> bool:
        return not (math.isnan(self.x) or math.isnan(self.y))


@dataclass(frozen=True)
class Layout:
    width: int
    height: int
    elements: tuple[Element, ...]
    source: dict  # the decoded JSON document, kept for the patch writer


def _number(value: Any) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


def _text(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _parse_element(node: dict) -> Element:
    x = _number(node.get("x"))
    y = _number(node.get("y"))
    raw_type = node.get("type")
    return Element(
        type=raw_type if isinstance(raw_type, str) else "",
        id=node.get("id"),
        x=math.nan if x is None else x,
        y=math.nan if y is None else y,
        width=_number(node.get("width")),
        height=_number(node.get("height")),
        rotation=_number(node.get("rotation")),
        category=_text(node.get("category")),
        label=_text(node.get("label")),
    )


def parse_layout(document: object) -> Layout:
    """Builds a Layout from a decoded JSON document."""
    if not isinstance(document, dict):
        raise LayoutError("Layout-JSON muss ein Objekt sein.")
    grid = document.get("gridSize")
    if not isinstance(grid, dict):
        raise LayoutError("gridSize fehlt im Layout.")
    width = _number(grid.get("width"))
    height = _number(grid.get("height"))
    if width is None or height is None or width < 1 or height < 1:
        raise LayoutError("gridSize.width und gridSize.height muessen Zahlen >= 1 sein.")
    raw_elements = document.get("elements", [])
    if not isinstance(raw_elements, list):
        raise LayoutError("elements muss eine Liste sein.")
    elements = tuple(_parse_element(node) for node in raw_elements if isinstance(node, dict))
    return Layout(width=int(width), height=int(height), elements=elements, source=document)


def load_layout(path: str) -> Layout:
    """Reads a layout JSON file."""
    try:
        with open(path, encoding="utf-8") as handle:
            document = json.load(handle)
    except FileNotFoundError as missing:
        raise LayoutError(f"Layout-Datei nicht gefunden: {path}") from missing
    except json.JSONDecodeError as broken:
        raise LayoutError(f"Layout ist kein gueltiges JSON ({path}): {broken}") from broken
    except OSError as unreadable:
        raise LayoutError(f"Layout-Datei kann nicht gelesen werden ({path}): {unreadable}") from unreadable
    return parse_layout(document)


def elements_of_type(layout: Layout, *types: str) -> list[Element]:
    return [element for element in layout.elements if element.type in types]


# ----------------------------------------------------------------- iOS rule

def is_axis_aligned(rotation_degrees: float) -> bool:
    """Same test as Swift RotatedRectGeometry.isAxisAligned (only multiples of 360 count as aligned)."""
    return math.fmod(rotation_degrees, 360.0) == 0.0


def rotated_corners(x: float, y: float, width: float, height: float, rotation_degrees: float) -> list[tuple[float, float]]:
    """Corners of the rectangle rotated around its centre (as RotatedRectGeometry.corners)."""
    centre_x = x + width / 2
    centre_y = y + height / 2
    half_w = width / 2
    half_h = height / 2
    radians = rotation_degrees * math.pi / 180
    cosine = math.cos(radians)
    sine = math.sin(radians)
    local = ((-half_w, -half_h), (half_w, -half_h), (half_w, half_h), (-half_w, half_h))
    return [(centre_x + px * cosine - py * sine, centre_y + px * sine + py * cosine) for px, py in local]


def _project(points: list[tuple[float, float]], axis: tuple[float, float]) -> tuple[float, float]:
    values = [px * axis[0] + py * axis[1] for px, py in points]
    return min(values), max(values)


def cell_overlaps_rect(i: int, j: int, corners: list[tuple[float, float]]) -> bool:
    """Separating-axis test: True when cell (i, j) and the rotated rectangle share area > 1e-6.

    Mirrors RotatedRectGeometry.overlapsCell.
    """
    cell = [(float(i), float(j)), (i + 1.0, float(j)), (i + 1.0, j + 1.0), (float(i), j + 1.0)]
    if len(corners) != 4:
        return False
    edge_a = (corners[1][0] - corners[0][0], corners[1][1] - corners[0][1])
    edge_b = (corners[3][0] - corners[0][0], corners[3][1] - corners[0][1])
    length_a = math.sqrt(edge_a[0] * edge_a[0] + edge_a[1] * edge_a[1])
    length_b = math.sqrt(edge_b[0] * edge_b[0] + edge_b[1] * edge_b[1])
    if not (length_a > 0 and length_b > 0):
        return False
    axes = (
        (1.0, 0.0),
        (0.0, 1.0),
        (edge_a[0] / length_a, edge_a[1] / length_a),
        (edge_b[0] / length_b, edge_b[1] / length_b),
    )
    for axis in axes:
        cell_min, cell_max = _project(cell, axis)
        rect_min, rect_max = _project(corners, axis)
        overlap = min(cell_max, rect_max) - max(cell_min, rect_min)
        if overlap <= IOS_OVERLAP_EPSILON:
            return False
    return True


def rotated_blocked_cells(x: float, y: float, width: Optional[float], height: Optional[float],
                          rotation_degrees: float, grid_width: int, grid_height: int) -> set[tuple[int, int]]:
    """All cells a rotated rectangle covers with real area (mirrors RotatedRectGeometry.blockedCells)."""
    rect_w = 1.0 if width is None else width
    rect_h = 1.0 if height is None else height
    if not (rect_w > 0 and rect_h > 0):
        return set()
    corners = rotated_corners(x, y, rect_w, rect_h, rotation_degrees)
    xs = [c[0] for c in corners]
    ys = [c[1] for c in corners]
    min_x = max(0, int(math.floor(min(xs))))
    max_x = min(grid_width, int(math.ceil(max(xs))))
    min_y = max(0, int(math.floor(min(ys))))
    max_y = min(grid_height, int(math.ceil(max(ys))))
    cells: set[tuple[int, int]] = set()
    if not (min_x < max_x and min_y < max_y):
        return cells
    for i in range(min_x, max_x):
        for j in range(min_y, max_y):
            if cell_overlaps_rect(i, j, corners):
                cells.add((i, j))
    return cells


def ios_blocked_cells(layout: Layout) -> set[tuple[int, int]]:
    """Cells blocked by the iOS rule."""
    blocked: set[tuple[int, int]] = set()
    for element in layout.elements:
        if element.type in NON_BLOCKING_TYPES or element.type == "anchor" or not element.has_position:
            continue
        if element.rotation is not None and not is_axis_aligned(element.rotation):
            blocked |= rotated_blocked_cells(element.x, element.y, element.width, element.height,
                                             element.rotation, layout.width, layout.height)
            continue
        start_x = math.floor(element.x)
        start_y = math.floor(element.y)
        span_x = max(1, math.ceil(element.w))
        span_y = max(1, math.ceil(element.h))
        for i in range(start_x, start_x + span_x):
            for j in range(start_y, start_y + span_y):
                if 0 <= i < layout.width and 0 <= j < layout.height:
                    blocked.add((i, j))
    return blocked


def walkable_cells(layout: Layout) -> set[tuple[int, int]]:
    """Cells walkable for the iOS indoor graph."""
    blocked = ios_blocked_cells(layout)
    return {(i, j) for i in range(layout.width) for j in range(layout.height) if (i, j) not in blocked}


# ----------------------------------------------------------- readiness rule

def _clamp(value: float) -> float:
    return max(-JAVA_CLAMP, min(JAVA_CLAMP, value))


def _rotated_bounding_box(x: float, y: float, w: float, h: float, rotation_degrees: float) -> tuple[float, float, float, float]:
    """Bounding box (min_x, max_x, min_y, max_y) of the rectangle rotated around its centre (Java mirror)."""
    centre_x = x + w / 2
    centre_y = y + h / 2
    radians = math.radians(rotation_degrees)
    cosine = math.cos(radians)
    sine = math.sin(radians)
    corners = ((x, y), (x + w, y), (x + w, y + h), (x, y + h))
    rotated = []
    for cx, cy in corners:
        dx = cx - centre_x
        dy = cy - centre_y
        rotated.append((centre_x + dx * cosine - dy * sine, centre_y + dx * sine + dy * cosine))
    xs = [p[0] for p in rotated]
    ys = [p[1] for p in rotated]
    return min(xs), max(xs), min(ys), max(ys)


def readiness_blocked_cells(layout: Layout) -> set[tuple[int, int]]:
    """Cells blocked by the Java readiness rule (StoreReadinessEvaluator.blockedCells)."""
    blocked: set[tuple[int, int]] = set()
    for element in layout.elements:
        if element.type in NON_BLOCKING_TYPES or not element.has_position:
            continue
        w = element.w
        h = element.h
        rotation = element.rotation
        if rotation is not None and rotation != 0 and math.isfinite(rotation):
            box_min_x, box_max_x, box_min_y, box_max_y = _rotated_bounding_box(element.x, element.y, w, h, rotation)
            x0 = math.floor(box_min_x + JAVA_EPS)
            x1 = math.ceil(box_max_x - JAVA_EPS)
            y0 = math.floor(box_min_y + JAVA_EPS)
            y1 = math.ceil(box_max_y - JAVA_EPS)
            if x1 <= x0:
                x1 = x0 + 1
            if y1 <= y0:
                y1 = y0 + 1
        else:
            x0 = math.floor(_clamp(element.x))
            x1 = x0 + max(1, math.ceil(_clamp(w)))
            y0 = math.floor(_clamp(element.y))
            y1 = y0 + max(1, math.ceil(_clamp(h)))
        for j in range(max(0, y0), min(layout.height, y1)):
            for i in range(max(0, x0), min(layout.width, x1)):
                blocked.add((i, j))
    return blocked


def readiness_walkable_cells(layout: Layout) -> set[tuple[int, int]]:
    """Cells the readiness check counts as walkable."""
    blocked = readiness_blocked_cells(layout)
    return {(i, j) for i in range(layout.width) for j in range(layout.height) if (i, j) not in blocked}
