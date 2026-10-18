## Decisions

1. Pure module `editor/coverage.ts`; shared JSON test vectors exported by the Python tool (`scripts/beacon-planner/fixtures/vectors.json`).
2. Overlay computed in a Web Worker if > 5,000 walkable cells; otherwise inline.
3. Overlay is view-only and never saved into the layout.

## Implementation notes

- **Takeover.** Person C does not work on this change; Erik's session implemented it on 2026-10-17. Branch `pilot/editor-coverage` is cut from `origin/pilot/first-store` plus `origin/pilot/beacon-planner`; the PR targets `pilot/first-store`.
- **One rule.** `editor/coverage.ts` imports `backend/indooro_server/src/main/resources/readiness/coverage-rule.json` directly (radius default and range, minimum beacons per cell, allowed low-coverage share). Readiness (Java) and the planner read the same file.
- **Blocking rule.** The overlay uses the Readiness rule (every element except `beacon` and `entrance` blocks its cells, anchors block, rotated elements block their bounding box), not the stricter iOS rule of the planner headline number. The overlay percentage can therefore differ slightly from the planner's headline value when anchors or rotated elements exist. HDOP is not ported.
- **Shared vectors.** `scripts/beacon-planner/export_vectors.py` writes `fixtures/vectors.json` from the planner functions; a Python test regenerates it and compares byte for byte, `coverage.test.ts` checks the TypeScript counts against it. Plan import fixtures follow the same pattern (`export_plan_fixtures.py`).
- **Worker.** Layouts with more than 5,000 walkable cells compute in `coverage.worker.ts`, smaller ones inline; if a Worker cannot be created the computation falls back inline. The overlay is view-only and never part of the layout document, the dirty state or the exported/saved JSON.
- **Plan import.** Store mode only: the global legacy mode publishes immediately and has no beacon-ownership check, so placeholder beacons would reach customers. In Store mode placeholder beacons are reported as `beacon-foreign`; saving a draft works, publishing stays blocked until they are assigned to real devices. `mount` and `notes` columns are not stored in elements (the planner patch does not store them either). The import is one undoable step (`createMany`).
