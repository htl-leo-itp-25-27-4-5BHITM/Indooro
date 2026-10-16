## 1. Setup

- [ ] 1.1 Create branch `pilot/field-measurement` from `origin/pilot/first-store` in its own worktree; run `swift test` in `swift/indooro-EinkaeuferFinal` and save the `REPLAY …` lines as the starting point in `docs/pilot-readiness/hardware/reports/0000-synthetic-baseline.md`.
- [ ] 1.2 Read `swift/indooro-EinkaeuferFinal/TESTING.md`, `NavigationFixtures/BASELINE.md`, `docs/NAVIGATION_REVIEW.md` sections F–H and `openspec/changes/stabilize-ios-navigation-pipeline/tasks.md` groups 12–13.
- [ ] 1.3 Run `npx -y @fission-ai/openspec@1.3.1 validate establish-pilot-field-measurement --strict`.

## 2. Beacon Standard and Hardware (documentation + human purchase)

- [ ] 2.1 Write `docs/pilot-readiness/hardware/BEACON_STANDARD.md`: project UUID (generate once with `uuidgen`), major/minor scheme, TX power and interval defaults, label format, mounting rules (above head height, on shelf tops or pillars, not behind goods, not on fridges, no drilling, no escape-route signs).
- [ ] 2.2 Write `docs/pilot-readiness/hardware/HARDWARE_SELECTION.md`: compare at least three iBeacon models that meet design decision 3 (price, battery, configurability, delivery time, configuration app); recommend one; list the exact order (12 units) and budget for the school.
- [ ] 2.3 Human step: order beacons after approval; record order date and delivery in `docs/pilot-readiness/team/STATUS.md`.
- [ ] 2.4 Create `docs/pilot-readiness/hardware/beacons.csv` with the columns from design decision 2 and fill it for the four existing test-room beacons.
- [ ] 2.5 Write `docs/pilot-readiness/hardware/CONFIGURE_BEACON.md`: step-by-step configuration with the chosen vendor app, including how to verify the advertised identity with the app's DEBUG log (`ibeacon-*` keys).

## 3. Test Room Layout

- [ ] 3.1 Human step: measure the test room (walls, shelves, beacon mounting points) with a laser distance meter; record sketch and numbers in `docs/pilot-readiness/hardware/sites/testraum.md`.
- [ ] 3.2 Update `swift/indooro-EinkaeuferFinal/indooroApp/Resources/layout.json` to the measured geometry (1 cell = 1 m) with real beacon UUID/major/minor; keep the file name.
- [ ] 3.3 Add the same layout to `Tests/IndooroNavigationCoreTests/Resources/layout-testraum.json` and a test that loads it and asserts ≥ 3 beacons, valid identities, an entrance, and a walkable graph.

## 4. Measurement Protocol and Tooling

- [ ] 4.1 Write `docs/pilot-readiness/hardware/MEASUREMENT_PROTOCOL.md` implementing the requirement „Field measurements follow a fixed protocol and produce a report“ (markers, order, durations, two devices, two times of day, how to set truth markers by long press, how to share files).
- [ ] 4.2 Write `docs/pilot-readiness/hardware/REPORT_TEMPLATE.md` with all report metrics and a decision section that maps results to pilot mode (table in `docs/pilot-readiness/03_PILOT_READINESS.md` 4.3).
- [ ] 4.3 Add an error-statistics helper that computes, per truth marker, the distance between truth and the estimated/projected position over the stationary window (median, P90) and the correct-aisle share for walking segments; implement it as a test helper in `Tests/IndooroNavigationCoreTests/` so `swift test --filter FieldRecordingTests` prints `FIELD <name> …` lines.
- [ ] 4.4 Add `scripts/field/check_recording_anonymized.sh` (or Swift test) that fails if a recording contains device names, UUIDs of devices (not beacons), or free-text fields other than event names.
- [ ] 4.5 Dry-run the protocol with the existing four beacons before new hardware arrives; fix protocol gaps.

## 5. Recordings (human steps + fixtures)

- [ ] 5.1 Human step: record ≥ 3 walks in the test room per protocol (two iPhone models); share files to the Mac.
- [ ] 5.2 Add them under `NavigationFixtures/recordings/testraum-<date>-<n>.jsonl` with replay and field tests; write `reports/<date>-testraum.md`.
- [ ] 5.3 Human step: find a larger room with shelves or aisles (library, workshop, storage); get permission from the school; mount 8 beacons at 6–8 m spacing; measure geometry (`sites/<name>.md`, layout in tests).
- [ ] 5.4 Record ≥ 2 walks there; add fixtures, tests and `reports/<date>-<site>.md`.
- [ ] 5.5 Measure battery drop during 30 minutes of navigation with „Mit Ortung“ on two devices and record it in the report.
- [ ] 5.6 Mark `stabilize-ios-navigation-pipeline` tasks 12.1, 12.2, 12.3 and 12.5 done when 5.1–5.4 satisfy their wording (store walks are replaced by the large test room until a store is available; note this there).

## 6. Analysis and Evidence-Based Calibration

- [ ] 6.1 Investigate the 17 m `maxStep` in the synthetic `determinism` and `wrongAisle` replays (design decision 7); document the cause in `NavigationFixtures/BASELINE.md`; fix if it is a pipeline defect, with a regression test.
- [ ] 6.2 Compare measured error to the off-route rule (4.0 m / 2.5 s) and the jump gate (2.5 m/s + 0.85 m); propose parameter changes only per the requirement „Positioning parameter changes require recorded evidence“.
- [ ] 6.3 Apply accepted parameter changes in `StabilizedNavigationConfig.swift` (one commit per parameter), update `BASELINE.md`, remove `// provisional` only where evidence exists; mark `stabilize-ios-navigation-pipeline` 12.4.
- [ ] 6.4 Measure SwiftUI re-evaluation while standing with `Self._printChanges()` in DEBUG on a device and close `stabilize-ios-navigation-pipeline` 10.4.
- [ ] 6.5 Write `docs/pilot-readiness/hardware/RESULT_SUMMARY.md`: median/P90 error per site, correct-aisle rate, recommended beacon spacing, recommended pilot mode (A/C/B), open risks.

## 7. Pilot Store Preparation (after a store agreed)

- [ ] 7.1 Create the store beacon plan (positions on the store layout, mounting photos) from `BEACON_STANDARD.md`; hand it to the store contact before mounting.
- [ ] 7.2 Human step: mount beacons, measure coordinates, enter them in the admin beacon management and layout together with the data owner (`prepare-pilot-store-operations`).
- [ ] 7.3 Run the protocol in the store; add fixtures and report; close `stabilize-ios-navigation-pipeline` 13.6 when its expectations hold.

## 8. Verification and Handover

- [ ] 8.1 Run `swift test` (all green, new field tests included) and `npx -y @fission-ai/openspec@1.3.1 validate establish-pilot-field-measurement --strict`.
- [ ] 8.2 Open a pull request `pilot/field-measurement` → `pilot/first-store` after section 5.2 (first real data) and again after 6.5; update `docs/pilot-readiness/team/STATUS.md` (row „Person B“).
