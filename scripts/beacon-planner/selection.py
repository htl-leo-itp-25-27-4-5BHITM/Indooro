"""Greedy beacon selection with a pruning pass (design decision 4).

Goal: (a) at least `target` of the iOS-walkable cells are ok (k beacons within R, HDOP <= H) AND
(b) the Java readiness mirror (count-based, rule radius and k) reports ok.
Greedy order per candidate: most new ok cells, then most progress (cells below k), then lowest
mean HDOP, then lowest candidate ID. Pruning then removes beacons in descending ID order as long
as the goal still holds. No randomness; all iteration is over sorted lists.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Sequence

from candidates import Candidate
from coverage import CoverageState, build_cover, build_universe, readiness_report
from layout import Layout, ios_blocked_cells
from rule import CoverageRule


@dataclass(frozen=True)
class PlanParams:
    radius_m: float
    k: int
    hdop_limit: float = 2.5
    target: float = 0.95
    max_beacons: int = 200
    shelf_penalty_m: float = 0.0


@dataclass
class PlanResult:
    beacons: list = field(default_factory=list)  # Candidate objects, sorted by (y, x)
    reached: bool = False
    ok_share: float = 0.0
    ios_walkable: int = 0
    low_cells_ios: int = 0  # iOS-walkable cells with fewer than k beacons within R (count only)
    counts: dict = field(default_factory=dict)  # (i, j) -> beacons within R, iOS-walkable cells
    readiness: dict = field(default_factory=dict)
    candidate_count: int = 0


def plan_beacons(layout: Layout, rule: CoverageRule, params: PlanParams,
                 candidates: Sequence[Candidate]) -> PlanResult:
    universe = build_universe(layout)
    blocked = ios_blocked_cells(layout) if params.shelf_penalty_m > 0 else None
    cover = build_cover(universe, candidates, params.radius_m, blocked, params.shelf_penalty_m)
    state = CoverageState(universe, cover, params.k, params.hdop_limit)

    def positions(ids: Sequence[int]) -> list[tuple[float, float]]:
        return [(candidates[cid].x, candidates[cid].y) for cid in ids]

    def goal(ids: Sequence[int]) -> bool:
        if state.ok_share_ios() < params.target:
            return False
        return readiness_report(layout, positions(ids), rule)["ok"]

    selected: list[int] = []
    chosen: set[int] = set()
    while not goal(selected):
        if len(selected) >= params.max_beacons:
            break
        best_id: Optional[int] = None
        best_key = None
        for cid in range(len(candidates)):
            if cid in chosen or not cover[cid]:
                continue
            new_ok, progress, mean_hdop = state.gain(cid)
            key = (-new_ok, -progress, mean_hdop, cid)
            if best_key is None or key < best_key:
                best_key = key
                best_id = cid
        if best_id is None:
            break
        state.add(best_id)
        selected.append(best_id)
        chosen.add(best_id)

    reached = goal(selected)
    if reached:
        for cid in sorted(selected, reverse=True):
            state.remove(cid)
            trial = [other for other in selected if other != cid]
            if goal(trial):
                selected = trial
            else:
                state.add(cid)

    counts = {}
    low_ios = 0
    for position, cell in enumerate(universe.cells):
        if universe.ios[position]:
            counts[cell] = state.count[position]
            if state.count[position] < params.k:
                low_ios += 1

    chosen_candidates = sorted((candidates[cid] for cid in selected), key=lambda c: (c.y, c.x))
    return PlanResult(
        beacons=chosen_candidates,
        reached=reached and goal(selected),
        ok_share=state.ok_share_ios(),
        ios_walkable=state.ios_total,
        low_cells_ios=low_ios,
        counts=counts,
        readiness=readiness_report(layout, [(c.x, c.y) for c in chosen_candidates], rule),
        candidate_count=len(candidates),
    )
