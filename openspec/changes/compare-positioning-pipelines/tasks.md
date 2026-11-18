## 1. Engine core on main (default off)

- [ ] 1.1 Copy the engine core files from `postpilot/ios-architecture` (commit `75ec224f`) into `swift/indooro-EinkaeuferFinal/Positioning/Engine/` with a provenance README; only `public` and `import IndooroNavigation` are removed.
- [ ] 1.2 Add library `IndooroPositioningCompare`, executable `compare-positioning` and test target to the root `Package.swift`; the app target and `indooroApp/` are unchanged.
- [ ] 1.3 Engine tests on main: `ReplayAgreementTests` adapted to the new module and a start/stop/calibrate smoke test.

## 2. Comparison replay

- [ ] 2.1 Truth track (holds, linear interpolation) and metrics with the definitions of `tools/beacon-lab/docs/METRICS.md`.
- [ ] 2.2 Current-pipeline path (`BeaconManager` timing: warm-up, tick, calibrate) and engine path on one timeline; agreement test against `NavigationReplay`.
- [ ] 2.3 CSV, JSON `indooro-position-comparison/1` and text summary; SYNTHETIC label; session role and scenario.
- [ ] 2.4 Command line `compare-positioning`; test on `NavigationFixtures/synthetic`, determinism test.

## 3. Wrapper, Lab and documentation

- [ ] 3.1 `scripts/field/compare_positioning.sh <recording.jsonl> --store <code>` and its tests; update `scripts/field/README.md` and `TESTRAUM_TAG.md`.
- [ ] 3.2 Lab importer for `indooro-position-comparison/1`, a synthetic sample file and a test that matches the Swift summary.
- [ ] 3.3 `POSITIONING_DECISION.md` (proposal, pre-registered rule).

## 4. Verification

- [ ] 4.1 `swift test` in `swift/indooro-EinkaeuferFinal` and in `Packages/IndooroKit`; Release build of the app target still compiles.
- [ ] 4.2 Python tests `python -I -m unittest discover scripts/field`, Lab `npm test` and typecheck.
- [ ] 4.3 `openspec validate --all --strict`.
