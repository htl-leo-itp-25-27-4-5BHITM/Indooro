## Why

No real beacon recording exists anywhere in the repository. All accuracy statements about Indooro are synthetic (replay tests with simulated noise and an artificial 8 × 8 m beacon grid). The pilot decision between a full BLE pilot, a hybrid pilot and a pilot without positioning (`docs/pilot-readiness/03_PILOT_READINESS.md`, section 4.3) depends on measured positioning error in a real room and later in the pilot store. In addition:

- No beacon vendor, model, UUID scheme or configuration is documented; the test-room layout uses a placeholder UUID (`swift/indooro-EinkaeuferFinal/indooroApp/Resources/layout.json`).
- The test-room layout (4 × 7 cells, 1 shelf) does not match `documentation/Layoutplan-Testraum.pdf` (about 5 × 9 m, two shelf rows).
- Two synthetic replay scenarios (`determinism`, `wrongAisle`) show a single projected step of about 17 m (`maxStep=17.13`, `lagP95=17.14`); the cause is undocumented.
- The open change `stabilize-ios-navigation-pipeline` still has its field tasks open (10.4, 12.1–12.5, 13.6), and 13 navigation parameters are marked `// provisional`.

The DEBUG recorder, the share action and the deterministic replay already exist (`Utilities/NavigationRecorder.swift`, `Utilities/NavigationReplay.swift`, `swift/indooro-EinkaeuferFinal/TESTING.md`). This change turns them into a repeatable field measurement process.

## What Changes

- Define the beacon deployment standard: one Indooro iBeacon UUID, major = store, minor = beacon number, documented TX power and advertising interval, physical labels, placement rules, and a configuration table per site.
- Correct the test-room layout from a new measurement and add real beacon identities.
- Define a field measurement protocol with ground-truth markers (stationary points, walking loop, wrong aisle, two nearly equidistant stops) and a report template with median and 90th-percentile position error, correct-aisle rate, reroutes, stop changes, off-route delay and battery use.
- Record at least three anonymized walks in the test room and at least two in a larger room with shelves or aisles; store them as replay fixtures with tests.
- Explain and, if it is a defect, fix the 17 m step in the synthetic replays.
- Calibrate provisional parameters only with recorded evidence and document every change with before/after replay metrics.
- Complete the field tasks of `stabilize-ios-navigation-pipeline` (12.1–12.5, 10.4; 13.6 in the pilot store).

## Capabilities

### New Capabilities

- `beacon-deployment`: beacon identity scheme, configuration record, placement and coordinate accuracy, measurement protocol and report.

### Modified Capabilities

- `mobile-positioning-navigation`: evidence rule for parameter changes, anonymized field fixtures.

## Impact

- Owner: Person B „Positionierung & Hardware“, branch `pilot/field-measurement`.
- Files: `docs/pilot-readiness/hardware/` (new: beacon standard, configuration table, measurement protocol, reports), `swift/indooro-EinkaeuferFinal/NavigationFixtures/` (recordings, `BASELINE.md`), `swift/indooro-EinkaeuferFinal/Tests/IndooroNavigationCoreTests/` (replay tests, test layouts), `indooroApp/Resources/layout.json` (test room), positioning pipeline files (`Utilities/PositioningPipeline.swift`, `PoseFusionService.swift`, `BeaconMeasurementStore.swift`, `BeaconPositionSolver.swift`, `StabilizedNavigationConfig.swift`, `NavigationReplay.swift`, `NavigationRecorder.swift`) only for the 17 m investigation and evidence-based calibration.
- Hardware purchase: 10–12 beacons (budget ca. 100–300 €, approval by the school).
- Backend, admin: unchanged; beacons are registered through the existing admin beacon management by the store data owner (`prepare-pilot-store-operations`).
- Privacy: recordings contain no device identifiers and no personal data; test persons are team members until consent forms exist.
