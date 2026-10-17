"""Candidate mounting positions (design decision 2, with team decisions from US-31).

* "shelf-top": points every ~2 m along the long centre line of each shelf (rotation applied).
* "wall": points every ~2 m along each wall element and along the grid edge.
* "checkout-top": points on checkout/counter centre lines (default; allow_checkout=False removes them).

Excluded:
* points strictly inside an entrance rectangle (the rectangle border stays admissible as a
  wall mount next to the door, unless entrance_edge=False);
* points inside checkout/counter rectangles, except the checkout/counter tops themselves
  (admitted by default, see allow_checkout);
* all points of elements whose label or category contains a keyword (case-insensitive).

Points closer than 0.25 m to an earlier point are dropped. Output order is deterministic:
sorted by (x, y, mount), IDs are the index in that order.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Optional, Sequence

from layout import Element, Layout

MOUNT_SHELF_TOP = "shelf-top"
MOUNT_WALL = "wall"
MOUNT_CHECKOUT_TOP = "checkout-top"
DEFAULT_EXCLUDE_KEYWORDS: tuple[str, ...] = ("kuehl", "kühl", "fridge", "tiefkuehl", "tiefkühl")
SPACING_M = 2.0
MIN_SEPARATION_M = 0.25
CHECKOUT_TYPES = ("checkout", "counter")
_TOLERANCE = 1e-9


@dataclass(frozen=True)
class Candidate:
    id: int
    x: float
    y: float
    mount: str
    notes: str


@dataclass(frozen=True)
class _Raw:
    x: float
    y: float
    mount: str
    notes: str
    source: Optional[Element] = None


def _local_offset(element: Element, x: float, y: float) -> tuple[float, float]:
    """Point offset from the element centre, rotated into the element's own frame."""
    centre_x, centre_y = element.center
    dx = x - centre_x
    dy = y - centre_y
    radians = (element.rotation or 0.0) * math.pi / 180
    cosine = math.cos(radians)
    sine = math.sin(radians)
    return dx * cosine + dy * sine, -dx * sine + dy * cosine


def _inside(element: Element, x: float, y: float, strict: bool = False) -> bool:
    """True when (x, y) lies inside the element rectangle.

    strict=False includes the border (tolerance 1e-9); strict=True only the open interior.
    """
    local_x, local_y = _local_offset(element, x, y)
    half_w = element.w / 2
    half_h = element.h / 2
    if strict:
        return abs(local_x) < half_w - _TOLERANCE and abs(local_y) < half_h - _TOLERANCE
    return abs(local_x) <= half_w + _TOLERANCE and abs(local_y) <= half_h + _TOLERANCE


def _has_keyword(element: Element, keywords: Sequence[str]) -> bool:
    text = f"{element.label or ''} {element.category or ''}".lower()
    return any(keyword in text for keyword in keywords)


def _line_points(element: Element, spacing: float) -> list[tuple[float, float]]:
    """Evenly spaced points (at most `spacing` apart) on the long centre line, rotation applied."""
    centre_x, centre_y = element.center
    if element.w >= element.h:
        length = element.w
        local_dir = (1.0, 0.0)
    else:
        length = element.h
        local_dir = (0.0, 1.0)
    radians = (element.rotation or 0.0) * math.pi / 180
    cosine = math.cos(radians)
    sine = math.sin(radians)
    dir_x = local_dir[0] * cosine - local_dir[1] * sine
    dir_y = local_dir[0] * sine + local_dir[1] * cosine
    count = max(1, math.ceil(length / spacing - 1e-9))
    points = []
    for index in range(count):
        offset = -length / 2 + (index + 0.5) * length / count
        points.append((centre_x + offset * dir_x, centre_y + offset * dir_y))
    return points


def _edge_points(layout: Layout, spacing: float) -> list[tuple[float, float]]:
    """Points every ~2 m along the four grid edges, at the middle of each segment."""
    count_x = max(1, math.ceil(layout.width / spacing - 1e-9))
    count_y = max(1, math.ceil(layout.height / spacing - 1e-9))
    points = []
    for index in range(count_x):
        x = (index + 0.5) * layout.width / count_x
        points.append((x, 0.0))
        points.append((x, float(layout.height)))
    for index in range(count_y):
        y = (index + 0.5) * layout.height / count_y
        points.append((0.0, y))
        points.append((float(layout.width), y))
    return points


_BASE_NAMES = {"shelf": "Regal", "wall": "Wand", "checkout": "Kasse", "counter": "Theke"}


def _element_name(element: Element) -> str:
    base = _BASE_NAMES.get(element.type, element.type)
    parts = [part for part in (element.category, element.label) if part]
    if not parts:
        return f"{base} {element.id}"
    if len(parts) == 2:
        return f"{base} {parts[0]} ({parts[1]})"
    return f"{base} {parts[0]}"


def generate_candidates(layout: Layout, keywords: Iterable[str] = DEFAULT_EXCLUDE_KEYWORDS,
                        spacing: float = SPACING_M, entrance_edge: bool = True,
                        allow_checkout: bool = True) -> list[Candidate]:
    """Builds the deterministic candidate list for a layout.

    entrance_edge=True (default, team decision): points on the entrance border stay admissible.
    allow_checkout=True (default, spec scene "demo reaches 95 %" takes precedence over the
    exclusion list in design.md decision 2; team decision US-31 open): checkout/counter tops
    become candidates.
    """
    lowered = tuple(keyword.lower() for keyword in keywords if keyword)
    entrances = [e for e in layout.elements if e.type == "entrance" and e.has_position]
    checkouts = [e for e in layout.elements if e.type in CHECKOUT_TYPES and e.has_position]
    raw: list[_Raw] = []

    for element in layout.elements:
        if not element.has_position or _has_keyword(element, lowered):
            continue
        if element.type == "shelf":
            mount = MOUNT_SHELF_TOP
        elif element.type == "wall":
            mount = MOUNT_WALL
        elif element.type in CHECKOUT_TYPES and allow_checkout:
            mount = MOUNT_CHECKOUT_TOP
        else:
            continue
        name = _element_name(element)
        for x, y in _line_points(element, spacing):
            raw.append(_Raw(x, y, mount, name, source=element))

    for x, y in _edge_points(layout, spacing):
        raw.append(_Raw(x, y, MOUNT_WALL, "Rasterrand"))

    def admissible(r: _Raw) -> bool:
        if not (0.0 <= r.x <= layout.width and 0.0 <= r.y <= layout.height):
            return False
        for entrance in entrances:
            if _inside(entrance, r.x, r.y, strict=entrance_edge):
                return False
        for checkout in checkouts:
            if checkout is r.source:
                continue
            if _inside(checkout, r.x, r.y):
                return False
        return True

    inside_grid = [r for r in raw if admissible(r)]
    inside_grid.sort(key=lambda r: (r.x, r.y, r.mount))

    kept: list[_Raw] = []
    for candidate in inside_grid:
        if any(math.hypot(candidate.x - other.x, candidate.y - other.y) < MIN_SEPARATION_M for other in kept):
            continue
        kept.append(candidate)

    return [Candidate(id=index, x=r.x, y=r.y, mount=r.mount, notes=r.notes) for index, r in enumerate(kept)]
