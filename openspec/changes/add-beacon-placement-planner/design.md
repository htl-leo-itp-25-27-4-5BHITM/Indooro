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

## Implementation notes

- **Takeover.** Person C does not work on this change; Erik's session implemented it on 2026-10-17.
- **Shared coverage rule.** Radius, minimum beacons per cell and the allowed low-coverage share live only in `backend/indooro_server/src/main/resources/readiness/coverage-rule.json`. `StoreReadinessEvaluator` reads it through `CoverageRule`; the planner reads the same file (`rule.py`, option `--rule`). The final values are a team decision (US-31); only defaults are documented. The planner checks every plan with a Python mirror of the Java rule (`coverage.readiness_report`, parity-tested against `StoreReadinessEvaluatorTest`) and keeps adding beacons until that check is OK. HDOP (default 2.5) is a stricter, planner-only criterion on top.
- **Blocking rule (task 1.2).** iOS `IndoorGraphBuilder.fromLayout`: every element except `beacon`, `entrance` and anchors blocks the cells it covers; axis-aligned elements block `floor(x)…floor(x)+max(1,ceil(w))` (same for y); rotated elements block every cell that the rotated rectangle really overlaps (separating-axis test). The Java readiness evaluator uses the bounding box of the rotated rectangle instead and blocks anchors. The planner covers the union of both cell sets.
- **File name.** `selection.py` instead of `select.py`: `select.py` would shadow the standard library module `select`. `plan.py` inserts its own directory into `sys.path`, because `python -I` does not.
- **Deviation from decision 2 (candidates).** Checkout/counter tops are allowed as mounting points by default (`--no-checkout` excludes them), and the grid border on the boundary of the entrance rectangle counts as wall mounting (`--no-entrance-edge` excludes it). Without them the demo supermarket reaches only 90.4 % (84.5 % without both), which contradicts the scenario „Demo supermarket“. The entrance interior and cooling elements stay excluded. The team decides in US-31.
- **One numbering.** CSV, SVG and layout patch use the same minors, starting after the largest minor already present in the layout (1 if none), so a physical beacon has one number everywhere.
- **Existing beacons** in the input layout are ignored for planning and kept in the patch.
- Added option `--shelf-penalty` (default 0 = off) for the optional line-of-sight penalty.
