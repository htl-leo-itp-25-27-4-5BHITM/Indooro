## 1. OpenSpec and Setup

- [x] 1.1 Write proposal, design, tasks and the `positioning-lab` spec for this change.
- [x] 1.2 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`. (Evidence: green on 2026-11-05.)
- [x] 1.3 Scaffold `tools/beacon-lab` (Vite 7, React 19, TypeScript, Tailwind CSS 4, Vitest, Playwright); Node.js 22.13 or newer.

## 2. Core, Data and Import

- [x] 2.1 Shared domain types, defaults, unit handling (`distanceUnit`, `formatDistance`), hashing (SHA-256, stable stringify, FNV-1a), seeded PRNG in `src/core`.
- [x] 2.2 CSV, JSON and `indooro-jsonl` import with column mapping, time-format detection, line-numbered issues, provenance with file SHA-256 and logged transformations (`src/data/import.ts`, `csv.ts`).
- [x] 2.3 Validation and run quality report (`validateSamples`, `validateReferences`, `assessRunQuality`).
- [x] 2.4 Floor plan from Indooro layout JSON and fictional demo store (`src/data/layout.ts`).
- [x] 2.5 IndexedDB persistence for campaigns, runs and saved results; campaign bundle export and import (`src/data/store.ts`, `export.ts`).
- [x] 2.6 Sample files under `tools/beacon-lab/samples/` (synthetic, labelled).

## 3. Positioning

- [x] 3.1 Causal RSSI filters (moving average, EMA, median, trimmed mean, Kalman) and optional Hampel (`filters.ts`).
- [x] 3.2 Epoch builder with window, stale handling and per-beacon aggregation (`epochs.ts`).
- [x] 3.3 Algorithms behind one interface: strongest beacon, weighted centroid, trilateration (Huber, Levenberg-Marquardt), kNN fingerprinting (`algorithms.ts`, `fingerprint.ts`).
- [x] 3.4 Temporal filters EMA, Kalman and speed gate that never fill failures (`temporal.ts`).
- [x] 3.5 Path-loss fit from calibration runs with censoring detection and `maxDistanceM` (`pathloss.ts`).
- [x] 3.6 Reference handling (hold, hold-or-nearest, interpolate) and metrics with failure policy and percentile type 7 (`reference.ts`, `metrics.ts`, `stats.ts`).
- [x] 3.7 Pipeline with `LeakageError` rules and `compareAlgorithms` with common epoch subset (`pipeline.ts`).

## 4. Map, Heatmaps and Replay

- [x] 4.1 SVG floor plan map without distortion, zoom/pan, layers, scale policy and SYNTHETIC badge (`src/map`).
- [x] 4.2 Heatmaps in `points`, `binned` and `idw` modes with honesty rules and legends.
- [x] 4.3 Replay with play/pause, step, speed, active beacons and failure notice.

## 5. UI, Report and Exports

- [x] 5.1 App shell, campaign list, overview, data, plan (scale confirmation with review note), RSSI, calibration, positioning, comparison, heatmap, replay and report pages (`src/ui`).
- [x] 5.2 Printable HTML report generated only from stored data, with facts-derived limitations, team interpretation section and reproducibility section (`src/report`).
- [x] 5.3 JSON and CSV exports of metrics and estimates.

## 6. Synthetic Data

- [x] 6.1 Deterministic generator with 8 scenarios and fixed seeds; demo campaign with 2 calibration and 4 evaluation runs (`src/data/synthetic.ts`).
- [x] 6.2 Document the model, scenarios, seeds and limits in `docs/SYNTHETIC_DATA.md`.

## 7. Documentation

- [x] 7.1 `README.md` and `docs/`: FIELD_GUIDE, ARCHITECTURE, IMPORT_FORMATS, ALGORITHMS, METRICS, MAP_AND_HEATMAPS, SYNTHETIC_DATA, REPORTING, TESTING, IOS_INTEGRATION_SPEC.
- [x] 7.2 Pin the recording format `indooro-recording/2` in `docs/IOS_INTEGRATION_SPEC.md` (specification only, no app change).

## 8. Verification

- [x] 8.1 `npm test` in `tools/beacon-lab`: 446 tests in 36 files green (run of 2026-11-05, twice in a row).
- [x] 8.2 `npm run test:e2e` in `tools/beacon-lab`: 20 Playwright tests green (17 desktop, 1 mobile, 2 screenshots), no console errors.
- [x] 8.3 `npm run typecheck` and `npm run build` in `tools/beacon-lab`.
- [x] 8.4 CI workflow `.github/workflows/beacon-lab.yaml` runs only for `tools/beacon-lab/**` and is green on the pull request (jobs `test` and `e2e`; E2E pinned to ubuntu-24.04, servers bound to 127.0.0.1).

## 8a. Extensions

- [x] 8a.1 Uncertainty (Wilson, block bootstrap), multi-run aggregation and along/cross-track error (`src/positioning/{uncertainty,aggregate,trackError}.ts`, statistics page, report table).
- [x] 8a.2 Beacon diagnostics: leave-one-out, residuals, reception (`src/positioning/diagnostics.ts`, beacon diagnostics page).
- [x] 8a.3 Placement simulation and variant comparison (`src/planning/**`, planning page).
- [x] 8a.4 Tests: 521 Vitest tests and 23 Playwright tests green.

## 9. Open Work (not part of this change)

- [ ] 9.1 First real field campaign: record walks per `establish-pilot-field-measurement`, anonymize, import into the lab, evaluate with the lab. Until then no accuracy statement about real hardware exists. (Human step.)
- [ ] 9.2 Confirm the scale on site with a measured reference distance and record the review note in the lab. (Human step.)
- [x] 9.3 Separate OpenSpec change for the iOS recorder (done in `extend-navigation-recording-metadata`, separate pull request) `indooro-recording/2` (`session`, `truth.marker`, `sync`), including `NavigationRecordLine`, `scripts/field/check_recording_anonymized.py` and `FieldExportTests`.
- [ ] 9.4 Archive this change after verification (`openspec archive add-positioning-lab`) and replace the generated "TBD" purpose of the new `positioning-lab` spec.
