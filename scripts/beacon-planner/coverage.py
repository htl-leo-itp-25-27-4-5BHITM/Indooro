"""Coverage model: HDOP, cell universe, incremental coverage state and the readiness mirror.

A cell is "ok" when at least k selected beacons lie within radius R (cell centre distance squared
<= R squared, as in Java) and the 2D HDOP of those beacons is <= the limit H.
HDOP = sqrt(trace((H^T H)^-1)) with H the rows of unit vectors cell -> beacon.
For a 2x2 matrix, trace(M^-1) = trace(M) / det(M), so no matrix inversion is needed.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence

from layout import Layout, readiness_walkable_cells, walkable_cells
from rule import CoverageRule

COLLINEAR_RELATIVE = 1e-9  # det / trace^2 below this means collinear (HDOP infinite)
HDOP_CAP_FOR_MEAN = 10.0  # infinite HDOP counts as 10 in the mean tie-break only
SHELF_STEP_M = 0.2
SHELF_NEAR_BEACON_M = 0.5  # crossings this close to the beacon (mounting shelf) are not counted
_UNIT_EPSILON = 1e-12


def hdop_from_sums(sxx: float, syy: float, sxy: float) -> float:
    """HDOP from the sums of outer products of unit vectors (sxx = sum ux^2, ...)."""
    trace = sxx + syy
    det = sxx * syy - sxy * sxy
    if trace <= 0 or det <= COLLINEAR_RELATIVE * trace * trace:
        return math.inf
    return math.sqrt(trace / det)


def unit_vector(px: float, py: float, qx: float, qy: float) -> tuple[float, float]:
    """Unit vector from p to q; (0, 0) when the points coincide (no geometric information)."""
    dx = qx - px
    dy = qy - py
    length = math.sqrt(dx * dx + dy * dy)
    if length < _UNIT_EPSILON:
        return 0.0, 0.0
    return dx / length, dy / length


def hdop(point: tuple[float, float], beacons: Sequence[tuple[float, float]]) -> float:
    """2D HDOP of the given beacon positions as seen from `point`."""
    sxx = syy = sxy = 0.0
    for bx, by in beacons:
        ux, uy = unit_vector(point[0], point[1], bx, by)
        sxx += ux * ux
        syy += uy * uy
        sxy += ux * uy
    return hdop_from_sums(sxx, syy, sxy)


@dataclass(frozen=True)
class Universe:
    """All cells that matter for planning: the union of the iOS and the readiness walkable sets."""
    cells: tuple[tuple[int, int], ...]
    index: dict
    ios: tuple[bool, ...]  # True where the cell is walkable for iOS
    width: int
    height: int


def build_universe(layout: Layout) -> Universe:
    ios_set = walkable_cells(layout)
    readiness_set = readiness_walkable_cells(layout)
    cells = tuple(sorted(ios_set | readiness_set))
    index = {cell: position for position, cell in enumerate(cells)}
    ios = tuple(cell in ios_set for cell in cells)
    return Universe(cells=cells, index=index, ios=ios, width=layout.width, height=layout.height)


def _crossings(blocked: set, beacon: tuple[float, float], cell_centre: tuple[float, float]) -> int:
    """Number of blocked runs (shelves, counters, walls) entered on the way from beacon to cell centre."""
    bx, by = beacon
    cx, cy = cell_centre
    length = math.hypot(cx - bx, cy - by)
    steps = max(1, int(length / SHELF_STEP_M))
    count = 0
    previous = False
    for step in range(1, steps):
        t = step / steps
        x = bx + (cx - bx) * t
        y = by + (cy - by) * t
        inside = (math.floor(x), math.floor(y)) in blocked
        if inside and not previous and t * length >= SHELF_NEAR_BEACON_M:
            count += 1
        previous = inside
    return count


def build_cover(universe: Universe, candidates: Sequence, radius: float,
                blocked: Optional[set] = None, shelf_penalty: float = 0.0) -> list[list[tuple[int, float, float]]]:
    """For each candidate: list of (cell index, ux, uy) for every universe cell within reach.

    With shelf_penalty > 0 each blocked run on the line of sight reduces the effective radius by that
    many metres (needs `blocked`, the iOS blocked cells).
    """
    radius_squared = radius * radius
    cover: list[list[tuple[int, float, float]]] = []
    for candidate in candidates:
        entries: list[tuple[int, float, float]] = []
        px, py = candidate.x, candidate.y
        i0 = max(0, math.floor(px - radius - 0.5))
        i1 = min(universe.width - 1, math.ceil(px + radius - 0.5))
        j0 = max(0, math.floor(py - radius - 0.5))
        j1 = min(universe.height - 1, math.ceil(py + radius - 0.5))
        for j in range(j0, j1 + 1):
            for i in range(i0, i1 + 1):
                position = universe.index.get((i, j))
                if position is None:
                    continue
                cx = i + 0.5
                cy = j + 0.5
                dx = cx - px
                dy = cy - py
                distance_squared = dx * dx + dy * dy
                if shelf_penalty > 0 and blocked is not None:
                    effective = radius - shelf_penalty * _crossings(blocked, (px, py), (cx, cy))
                    if effective <= 0 or distance_squared > effective * effective:
                        continue
                elif distance_squared > radius_squared:
                    continue
                ux, uy = unit_vector(cx, cy, px, py)
                entries.append((position, ux, uy))
        cover.append(entries)
    return cover


class CoverageState:
    """Beacons selected so far, with per-cell counts and HDOP sums; updated incrementally."""

    def __init__(self, universe: Universe, cover: list, k: int, hdop_limit: float) -> None:
        self.universe = universe
        self.cover = cover
        self.k = k
        self.hdop_limit = hdop_limit
        size = len(universe.cells)
        self.members: list[dict] = [dict() for _ in range(size)]  # candidate id -> (ux, uy)
        self.count = [0] * size
        self.sxx = [0.0] * size
        self.syy = [0.0] * size
        self.sxy = [0.0] * size
        self.ok = [False] * size
        self.ios_total = sum(1 for flag in universe.ios if flag)
        self.ok_ios = 0

    def _refresh(self, cell: int) -> None:
        members = self.members[cell]
        sxx = syy = sxy = 0.0
        for _, (ux, uy) in sorted(members.items()):
            sxx += ux * ux
            syy += uy * uy
            sxy += ux * uy
        self.count[cell] = len(members)
        self.sxx[cell] = sxx
        self.syy[cell] = syy
        self.sxy[cell] = sxy
        now_ok = len(members) >= self.k and hdop_from_sums(sxx, syy, sxy) <= self.hdop_limit
        if now_ok != self.ok[cell]:
            self.ok[cell] = now_ok
            if self.universe.ios[cell]:
                self.ok_ios += 1 if now_ok else -1

    def add(self, candidate_id: int) -> None:
        for cell, ux, uy in self.cover[candidate_id]:
            self.members[cell][candidate_id] = (ux, uy)
            self._refresh(cell)

    def remove(self, candidate_id: int) -> None:
        for cell, _, _ in self.cover[candidate_id]:
            self.members[cell].pop(candidate_id, None)
            self._refresh(cell)

    def ok_share_ios(self) -> float:
        """Share of iOS-walkable cells that are ok; 1.0 when there is nothing to cover."""
        if self.ios_total == 0:
            return 1.0
        return self.ok_ios / self.ios_total

    def gain(self, candidate_id: int) -> tuple[int, int, float]:
        """(new ok cells, progress, mean HDOP) if the candidate were added.

        Progress is the sum of increments of min(count, k), i.e. cells that were below k.
        """
        new_ok = 0
        progress = 0
        hdop_sum = 0.0
        entries = self.cover[candidate_id]
        for cell, ux, uy in entries:
            count = self.count[cell]
            if count < self.k:
                progress += 1
            sxx = self.sxx[cell] + ux * ux
            syy = self.syy[cell] + uy * uy
            sxy = self.sxy[cell] + ux * uy
            value = hdop_from_sums(sxx, syy, sxy)
            if not self.ok[cell] and count + 1 >= self.k and value <= self.hdop_limit:
                new_ok += 1
            hdop_sum += min(value, HDOP_CAP_FOR_MEAN)
        mean = hdop_sum / len(entries) if entries else math.inf
        return new_ok, progress, mean


def readiness_report(layout: Layout, beacons: Sequence[tuple[float, float]], rule: CoverageRule,
                     radius: Optional[float] = None) -> dict:
    """Exact mirror of the Java readiness coverage check (count-based, no HDOP).

    Returns walkable, low_coverage, low_share and ok. ok is False only when more than
    max_low_coverage_share of the walkable cells have fewer than min_beacons_per_cell beacons.
    """
    reach = rule.radius_m if radius is None else radius
    walkable = readiness_walkable_cells(layout)
    counts: dict[tuple[int, int], int] = {}
    radius_squared = reach * reach
    for bx, by in beacons:
        i0 = max(0, math.floor(bx - reach - 0.5))
        i1 = min(layout.width - 1, math.ceil(bx + reach - 0.5))
        j0 = max(0, math.floor(by - reach - 0.5))
        j1 = min(layout.height - 1, math.ceil(by + reach - 0.5))
        for j in range(j0, j1 + 1):
            for i in range(i0, i1 + 1):
                dx = (i + 0.5) - bx
                dy = (j + 0.5) - by
                if dx * dx + dy * dy <= radius_squared:
                    counts[(i, j)] = counts.get((i, j), 0) + 1
    low = sum(1 for cell in walkable if counts.get(cell, 0) < rule.min_beacons_per_cell)
    total = len(walkable)
    ok = not (total > 0 and low > rule.max_low_coverage_share * total)
    return {
        "walkable": total,
        "low_coverage": low,
        "low_share": (low / total) if total else 0.0,
        "ok": ok,
    }
