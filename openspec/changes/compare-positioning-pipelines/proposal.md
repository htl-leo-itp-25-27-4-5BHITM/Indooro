## Why

Sprint story #195 asks whether the new position calculation (`PositioningEngine`, written on branch `postpilot/ios-architecture`) is switched on. Today there is no way to answer this from data. The engine exists only on that branch (42 commits ahead and 50 behind `main`), so nothing on `main` can run it, and the field tooling (`scripts/field/`, `NavigationReplay`, the Positioning Lab) only knows the current app pipeline. The first real recording is planned for this sprint. If the comparison method and the decision rule are written after the numbers are known, the decision can be bent to fit the numbers.

## What Changes

- Bring the engine core of `postpilot/ios-architecture` onto `main` as a separate SwiftPM target (`IndooroPositioningCompare`) in the existing root package, default off. The app target, `BeaconManager`, routing and all flags stay untouched; no file under `indooroApp/` changes. The whole postpilot branch is NOT merged.
- New command line tool `compare-positioning` (SwiftPM executable) that replays one `indooro-recording/2` file through two paths on the same timeline and the same layout: the current pipeline as `BeaconManager` runs it, and `PositioningEngine`. It writes a per-epoch CSV and JSON (`indooro-position-comparison/1`) with truth, position and confidence of both paths, and a text summary per path (median, P90, P95, share within 2/3/5 m, outage rate, jump rate). Metric definitions follow `tools/beacon-lab/docs/METRICS.md`.
- Wrapper `scripts/field/compare_positioning.sh <recording.jsonl> --store SPAR-Leonding-002`, documented in `scripts/field/README.md` and `docs/pilot-readiness/hardware/TESTRAUM_TAG.md`.
- The Positioning Lab gets a small pure importer for `indooro-position-comparison/1` (two methods, same epochs) and a test that checks the Lab metrics against the numbers the Swift tool wrote. No UI change.
- New `docs/pilot-readiness/hardware/POSITIONING_DECISION.md`: a pre-registered decision rule, written before any real data is seen, marked as a proposal for the team to confirm.
- Results on the synthetic test-room recording are labelled SYNTHETIC everywhere and must not be quoted as measurements.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-positioning-navigation`: offline comparison of the current pipeline and the new engine on recordings, and a pre-registered decision rule for switching the engine on.

## Impact

- Affected: `swift/indooro-EinkaeuferFinal/Package.swift` (new library, executable and test target), new directory `swift/indooro-EinkaeuferFinal/Positioning/`, `scripts/field/`, `tools/beacon-lab/src/data/` (importer and test), docs under `docs/pilot-readiness/hardware/`.
- Not affected: the app target and `MCindooroApp.xcodeproj`, `BeaconManager`, routing, the `IndooroShadowPositioning` flag (it stays on `postpilot/ios-architecture`), backend, admin UI, OpenAPI contract, database. No deployment, no live write.
- Limit of the method: both paths share `PositioningPipeline` (solver, estimator, projection). An offline replay therefore compares the engine's orchestration (sample mapping, warm-up, tick cadence), not the radio layer (`CoreLocationBeaconRadio` against the `BeaconManager` radio code). Radio differences need the shadow mode in the field and are named as such in the decision document.
- When `postpilot/ios-architecture` is merged later, `Positioning/` is deleted and the target is repointed to the `IndooroPositioning` package target; the copied files are marked with their source commit.
