## Context

- Layout JSON: `gridSize {width,height}`, `elements[]` with `type` (`shelf`, `wall`, `checkout`, `entrance`, `beacon`, …), `x`, `y`, `width`, `height`, optional `rotation`; 1 unit = 1 m (convention from `prepare-pilot-store-operations`).
- iOS walkable graph: 1 m grid, shelves/checkouts/walls block cells, entrance walkable (`Utilities/IndoorGraph.swift`, `IndoorGraphBuilder.fromLayout`). The planner mirrors this rule including rotated rectangles (cell center inside rotated rectangle = blocked).
- Synthetic tests inject one beacon per 8 × 8 m cell (`Tests/IndooroNavigationCoreTests/TestLayouts`).

## Goals / Non-Goals

Goals: a reproducible, explainable proposal for count and positions; a coverage picture the store contact can understand.

Non-goals: RF propagation simulation, wall attenuation physics, optimization guarantees, GUI.

## Decisions

1. **Language and dependencies.** Python 3.10+, standard library only (SVG written as text); runs with `python -I` on Windows.
2. **Candidates.** Points on the long edges/tops of shelves every 2 m, on walls every 2 m, at pillars if present; excluded: entrance cells, checkouts, elements marked as fridge (if `category`/label contains configurable keywords).
3. **Coverage model.** A walkable cell is covered when at least `k` (default 3) selected beacons lie within radius `R` (default 8 m, configurable) and the horizontal dilution of precision (HDOP) from those beacons is below `H` (default 2.5). Optional penalty: each shelf crossed by the line of sight reduces the effective radius by a configurable amount (default 0 = off).
4. **Selection.** Greedy: repeatedly add the candidate that covers the most uncovered cells (tie-break by lowest HDOP, then by id for determinism) until the target share (default 95 %) is reached or the maximum count is hit; then a pruning pass removes beacons whose removal keeps the target.
5. **Outputs.** `beacons-plan.csv` with `minor,x_m,y_m,mount,notes`; `coverage.svg` (cells colored by number of beacons in range, beacons as numbered dots); `layout-with-beacons.json` (input layout plus beacon elements with placeholder UUID and sequential minors, never overwriting the input).
6. **CLI.** `python -I scripts/beacon-planner/plan.py <layout.json> --radius 8 --k 3 --target 0.95 --out <dir>`.

## Risks / Trade-offs

- The radius model overestimates coverage behind metal shelves; documented clearly, and the optional shelf penalty allows a conservative plan.
- Greedy is not optimal; adequate for tens of beacons.

## Migration / Rollback

Additive tool.
