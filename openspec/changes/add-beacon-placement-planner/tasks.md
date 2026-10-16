## 1. Setup

- [ ] 1.1 Check out `pilot/beacon-planner`, merge `origin/pilot/first-store`; install Python 3.10+ and Node.js; run `npx -y @fission-ai/openspec@1.3.1 validate add-beacon-placement-planner --strict`.
- [ ] 1.2 Read `swift/indooro-EinkaeuferFinal/indooroApp/Utilities/IndoorGraph.swift` (`IndoorGraphBuilder.fromLayout`) and note the blocking rule in `design.md` („Implementation notes“); read `docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md` 3.

## 2. Core

- [ ] 2.1 `scripts/beacon-planner/layout.py`: load layout JSON, walkable cell grid with rotated-rectangle blocking, list of shelves/walls.
- [ ] 2.2 `candidates.py`: candidate mounting points per design decision 2 with exclusion keywords.
- [ ] 2.3 `coverage.py`: per cell count of beacons within R, HDOP from beacon geometry, optional shelf-crossing penalty.
- [ ] 2.4 `select.py`: greedy selection + pruning, deterministic tie-breaks.
- [ ] 2.5 `plan.py`: CLI per design decision 6, exit codes, summary output (beacon count, coverage share, cells below k).

## 3. Outputs

- [ ] 3.1 CSV writer (`beacons-plan.csv`).
- [ ] 3.2 SVG writer (`coverage.svg`) with legend, scale bar in meters, entrance marker.
- [ ] 3.3 Layout patch writer (`layout-with-beacons.json`), input never modified.

## 4. Tests and Validation

- [ ] 4.1 Unit tests (`python -I -m unittest discover scripts/beacon-planner`): walkable grid incl. rotated shelf, HDOP for collinear vs spread beacons, greedy determinism, unreachable target exit code, CSV/SVG/JSON outputs.
- [ ] 4.2 Run on `swift/indooro-EinkaeuferFinal/indooroApp/Resources/layout.json` (test room) and `layout-demosupermarkt.json`; record counts, coverage and the SVGs in `docs/pilot-readiness/hardware/PLANNER.md`.
- [ ] 4.3 Compare with the 8 × 8 m grid from the synthetic tests (count and coverage) and explain differences in `PLANNER.md`.
- [ ] 4.4 Document usage for Windows (PowerShell) and macOS in `PLANNER.md`, including the limitation „Planungshilfe, keine Messung“.

## 5. Handover

- [ ] 5.1 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 5.2 Open a pull request `pilot/beacon-planner` → `pilot/first-store`; update `STATUS.md` (row „Person C“).
