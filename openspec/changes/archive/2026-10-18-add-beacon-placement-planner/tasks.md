## 1. Setup

- [x] 1.1 Check out `pilot/beacon-planner`, merge `origin/pilot/first-store`; install Python 3.10+ and Node.js; run `npx -y @fission-ai/openspec@1.3.1 validate add-beacon-placement-planner --strict`.
- [x] 1.2 Read `swift/indooro-EinkaeuferFinal/indooroApp/Utilities/IndoorGraph.swift` (`IndoorGraphBuilder.fromLayout`) and note the blocking rule in `design.md` („Implementation notes“); read `docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md` 3.

## 2. Core

- [x] 2.1 `scripts/beacon-planner/layout.py`: load layout JSON, walkable cell grid with rotated-rectangle blocking, list of shelves/walls.
- [x] 2.2 `candidates.py`: candidate mounting points per design decision 2 with exclusion keywords.
- [x] 2.3 `coverage.py`: per cell count of beacons within R, HDOP from beacon geometry, optional shelf-crossing penalty.
- [x] 2.4 `select.py`: greedy selection + pruning, deterministic tie-breaks.
- [x] 2.5 `plan.py`: CLI per design decision 6, exit codes, summary output (beacon count, coverage share, cells below k).

## 3. Outputs

- [x] 3.1 CSV writer (`beacons-plan.csv`).
- [x] 3.2 SVG writer (`coverage.svg`) with legend, scale bar in meters, entrance marker.
- [x] 3.3 Layout patch writer (`layout-with-beacons.json`), input never modified.

## 4. Tests and Validation

- [x] 4.1 Unit tests (`python -I -m unittest discover scripts/beacon-planner`): walkable grid incl. rotated shelf, HDOP for collinear vs spread beacons, greedy determinism, unreachable target exit code, CSV/SVG/JSON outputs.
- [x] 4.2 Run on `swift/indooro-EinkaeuferFinal/indooroApp/Resources/layout.json` (test room) and `layout-demosupermarkt.json`; record counts, coverage and the SVGs in `docs/pilot-readiness/hardware/PLANNER.md`.
- [x] 4.3 Compare with the 8 × 8 m grid from the synthetic tests (count and coverage) and explain differences in `PLANNER.md`.
- [x] 4.4 Document usage for Windows (PowerShell) and macOS in `PLANNER.md`, including the limitation „Planungshilfe, keine Messung“.

## 5. Handover

- [x] 5.1 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [x] 5.2 Open a pull request `pilot/beacon-planner` → `pilot/first-store`; update `STATUS.md` (row „Person C“). (Beleg: PR #124 `pilot/beacon-planner` → `pilot/first-store` gemergt)
