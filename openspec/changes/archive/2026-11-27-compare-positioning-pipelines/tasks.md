## 1. Engine core on main (default off)

- [x] 1.1 Copy the engine core files from `postpilot/ios-architecture` (commit `75ec224f`) into `swift/indooro-EinkaeuferFinal/Positioning/Engine/` with a provenance README; only `public` and `import IndooroNavigation` are removed.
- [x] 1.2 Extend the root `Package.swift` (the engine core and the comparison code join the `IndooroNavigationCore` module, new executable `compare-positioning`, new test target); the app target and `indooroApp/` are unchanged. A second library target is not possible because SwiftPM forbids one source file in two targets.
- [x] 1.3 Engine on main is tested through the comparison: engine path equals the current path tick for tick, `NavigationReplay` equals the current path without warm-up, sample mapping reports unresolvable identities.

## 2. Comparison replay

- [x] 2.1 Truth track (holds, linear interpolation) and metrics with the definitions of `tools/beacon-lab/docs/METRICS.md`.
- [x] 2.2 Current-pipeline path (`BeaconManager` timing: warm-up, tick, calibrate) and engine path on one timeline; agreement test against `NavigationReplay`.
- [x] 2.3 CSV, JSON `indooro-position-comparison/1` and text summary; SYNTHETIC label; session role and scenario.
- [x] 2.4 Command line `compare-positioning`; test on `NavigationFixtures/synthetic`, determinism test.

## 3. Wrapper, Lab and documentation

- [x] 3.1 `scripts/field/compare_positioning.sh <recording.jsonl> --store <code>` and its tests; update `scripts/field/README.md` and `TESTRAUM_TAG.md`.
- [x] 3.2 Lab importer for `indooro-position-comparison/1`, a synthetic sample file and a test that matches the Swift summary.
- [x] 3.3 `POSITIONING_DECISION.md` (proposal, pre-registered rule).

## 4. Verification

- [x] 4.1 `swift test` in `swift/indooro-EinkaeuferFinal` (315 tests) and in `Packages/IndooroKit` (146 tests); `swift build -c release` of the root package. The iOS Release build of the app target could not run locally (iOS platform not installed); no file of the app target changed (`git diff` of `indooroApp/`, `MCindooroApp.xcodeproj` and `Packages/` against `main` is empty), the CI job `ios.yaml` builds it.
- [x] 4.2 Python tests `python -I -m unittest discover scripts/field`, Lab `npm test` and typecheck.
- [x] 4.3 `openspec validate compare-positioning-pipelines --strict` is valid. `validate --all --strict` still reports two older changes (`establish-pilot-field-measurement`, `modernize-ios-client-architecture`) as before; they are not touched here.
