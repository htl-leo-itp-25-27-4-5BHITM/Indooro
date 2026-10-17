Owners: **[C]** = Person C (Windows: documentation, hardware, physical measurement, Python analysis). **[E]** = Erik (Mac: Swift replay, fixtures, calibration, DEBUG builds on team iPhones). Work branches: `pilot/field-measurement` for [C], `pilot/field-replay` for [E].

## 1. Setup

- [ ] 1.1 [C] Check out `pilot/field-measurement`, merge `origin/pilot/first-store`; read `swift/indooro-EinkaeuferFinal/TESTING.md`, `NavigationFixtures/BASELINE.md`, `docs/NAVIGATION_REVIEW.md` F–H and `stabilize-ios-navigation-pipeline/tasks.md` groups 12–13.
- [x] 1.2 [E] Check out `pilot/field-replay`, run `swift test` and save the `REPLAY …` lines as `docs/pilot-readiness/hardware/reports/0000-synthetic-baseline.md`.
- [ ] 1.3 [C] Run `npx -y @fission-ai/openspec@1.3.1 validate establish-pilot-field-measurement --strict`.

## 2. Beacon Standard and Hardware

- [x] 2.1 [C] Write `docs/pilot-readiness/hardware/BEACON_STANDARD.md`: project UUID (generate once with `uuidgen` or PowerShell `[guid]::NewGuid()`), major/minor scheme, TX power and interval defaults, label format, mounting rules (above head height, on shelf tops or pillars, not behind goods, not on fridges, no drilling, not on escape-route signs). Erledigt: `BEACON_STANDARD.md` mit Projekt-UUID (2026-10-17); Startwerte TX/Intervall im Dry-Run (4.7) zu bestätigen.
- [x] 2.2 [C] Write `docs/pilot-readiness/hardware/HARDWARE_SELECTION.md`: compare at least three configurable iBeacon models (price, battery, configuration app for iOS/Android, delivery time); recommend one; exact order of 12 units and budget for the school. Entwurf erledigt: vier Modelle mit Quellen; Empfehlung Minew E8; offene Felder `unbekannt (Mensch: prüfen)`.
- [ ] 2.3 [C] Human step: order after approval; record order and delivery in `docs/pilot-readiness/team/STATUS.md`. (Mensch: Freigabe und Bestellung, danach STATUS.md.)
- [ ] 2.4 [C] Create `docs/pilot-readiness/hardware/beacons.csv` (columns from design decision 2) and fill it for the four existing test-room beacons. Kopfzeile von `beacons.csv` angelegt (Mensch: die vier vorhandenen Beacons mit Koordinaten und Messwerten eintragen).
- [x] 2.5 [C] Write `docs/pilot-readiness/hardware/CONFIGURE_BEACON.md` with the vendor app and how to verify the advertised identity (vendor app scanner or the app's DEBUG log keys `ibeacon-*`).

## 3. Test Room Layout

- [ ] 3.1 [C] Human step: measure the test room (walls, shelves, beacon mounting points) with a laser distance meter; record sketch and numbers in `docs/pilot-readiness/hardware/sites/testraum.md`. (Mensch: Raum mit Laserentfernungsmesser vermessen; Vorlage `sites/SITE_TEMPLATE.md`.)
- [ ] 3.2 [C] Write the measured layout as JSON (1 cell = 1 m, real beacon UUID/major/minor, one entrance) to `docs/pilot-readiness/hardware/sites/layout-testraum.json` and validate it with the planner (`add-beacon-placement-planner`) once available. (Mensch: wartet auf Messung 3.1; der Planer `add-beacon-placement-planner` ist noch nicht in `pilot/first-store`.)
- [ ] 3.3 [E] Replace `swift/indooro-EinkaeuferFinal/indooroApp/Resources/layout.json` with the measured layout (keep the file name); add it as `Tests/IndooroNavigationCoreTests/Resources/layout-testraum.json` with a test asserting ≥ 3 beacons, valid identities, an entrance and a connected walkable graph. Waiting for measurement (Person C): `layout-testraum.json` (task 3.2) does not exist yet.

## 4. Measurement Protocol and Tooling

- [x] 4.1 [C] Write `docs/pilot-readiness/hardware/MEASUREMENT_PROTOCOL.md` implementing the requirement „Field measurements follow a fixed protocol and produce a report“ (markers, order, durations, two devices, two times of day, truth markers by long press 0.6 s, sharing files via AirDrop/Files to the Mac of Erik or Person A). Entwurf; Dry-Run-Lücken siehe 4.7.
- [x] 4.2 [C] Write `docs/pilot-readiness/hardware/REPORT_TEMPLATE.md` with all report metrics and a decision section mapping results to pilot mode (`03_PILOT_READINESS.md` 4.3).
- [x] 4.3 [E] Add a replay export: `swift test --filter FieldExport` (or a small executable target) writes for each recording `<name>-ticks.csv` with `t,truth_x,truth_y,est_x,est_y,proj_x,proj_y,confidence,beacons_used,route_rebuild,stop_change` into `NavigationFixtures/exports/` (gitignored for real data). Real recordings: `FieldExportTests.testFieldExportOfIncomingRecordings` exports `NavigationFixtures/recordings/<site>-<date>-<n>.jsonl` with `Resources/layout-<site>.json` (override `FIELD_EXPORT_LAYOUT`).
- [x] 4.4 [C] Implement `scripts/field/field_stats.py` (Python standard library, `python -I`): reads `*-ticks.csv`, computes per truth marker median/P90 error over the stationary window, correct-aisle share for walking segments (aisle polygons from the layout JSON), reroutes per tour; writes a Markdown table for the report. Unit tests with synthetic CSVs (`python -I -m unittest discover scripts/field`). `scripts/field/field_stats.py` (Gang-Rechtecke aus der Standortdatei oder Layout-Elementen vom Typ `aisle`; Pooling über mehrere Aufnahmen).
- [x] 4.5 [C] Implement `scripts/field/check_recording_anonymized.py` that fails if a recording contains device names, device UUIDs (not beacon UUIDs) or free text other than event names; tests with synthetic lines. Zusätzlich `anonymize_recording.py` und `import_recordings.py` (Anonymisieren, prüfen, nummeriert nach `recordings/` übernehmen). Alle drei mit Tests: `python -I -m unittest discover scripts/field`.
- [ ] 4.6 [E] Install the DEBUG build with recorder on the team iPhones used for measurements (Erik's and Person A's Macs); document in `docs/pilot-readiness/team/DEVICES.md`. **Human step (Erik):** install the DEBUG build with recorder on the measurement iPhones (Xcode run on the device, Einstellungen → Debug → „Messungen aufzeichnen“); list the devices in `docs/pilot-readiness/team/DEVICES.md`.
- [ ] 4.7 [C] Dry-run the protocol with the existing four beacons before new hardware arrives; fix protocol gaps. (Mensch: Dry-Run mit den vier vorhandenen Beacons; Checkliste in `MEASUREMENT_PROTOCOL.md`.)

## 5. Recordings

- [ ] 5.1 [C] Human step: record ≥ 3 walks in the test room per protocol (two iPhone models); share files to [E] (place them in `NavigationFixtures/incoming/`, gitignored). (Mensch: Aufnahmen im Testraum nach `MEASUREMENT_PROTOCOL.md`.)
- [ ] 5.2 [E] Check anonymization with 4.5, move accepted files to `NavigationFixtures/recordings/testraum-<date>-<n>.jsonl`, add replay tests, run the export 4.3; [C] runs 4.4 and writes `reports/<date>-testraum.md`. Waiting for measurement (Person C): no files in `NavigationFixtures/incoming/` yet.
- [ ] 5.3 [C] Human step: organize a larger room with shelves or aisles (library, workshop, storage), get permission from the school, mount 8 beacons at 6–8 m spacing (use the planner), measure geometry (`sites/<name>.md`, layout JSON). (Mensch: Raum, Freigabe, Montage, Vermessung; `CHECKLIST_GROSSER_RAUM.md` liegt bereit.)
- [ ] 5.4 [C]+[E] Record ≥ 2 walks there; fixtures, replay tests, export, statistics and `reports/<date>-<site>.md` as in 5.2. Waiting for measurement (Person C). (Mensch: Aufnahmen im großen Raum.)
- [ ] 5.5 [C] Measure battery drop during 30 minutes of navigation with „Mit Ortung“ on two devices; record in the report. (Mensch: Akku-Messung am Gerät; Ablauf im Protokoll.)
- [ ] 5.6 [E] Mark `stabilize-ios-navigation-pipeline` 12.1, 12.2, 12.3 and 12.5 done when 5.1–5.4 satisfy their wording (store walks replaced by the large test room until a store is available; note this there). Waiting for 5.1–5.4.

## 6. Analysis and Evidence-Based Calibration

- [x] 6.1 [E] Investigate the 17 m `maxStep` in the synthetic `determinism` and `wrongAisle` replays (design decision 7); document the cause in `NavigationFixtures/BASELINE.md`; fix if it is a pipeline defect, with a regression test.
- [ ] 6.2 [C] Compare measured error to the off-route rule (4.0 m / 2.5 s) and the jump gate (2.5 m/s + 0.85 m) in a short analysis `docs/pilot-readiness/hardware/PARAMETER_ANALYSIS.md`; propose changes only per the requirement „Positioning parameter changes require recorded evidence“. Gerüst `PARAMETER_ANALYSIS.md` angelegt (Mensch/Auswertung: Messdaten abwarten).
- [ ] 6.3 [E] Apply accepted parameter changes in `StabilizedNavigationConfig.swift` (one commit per parameter), update `BASELINE.md`, remove `// provisional` only with evidence; mark `stabilize-ios-navigation-pipeline` 12.4. Waiting for recordings (evidence rule: ≥ 2 recordings from the target site); no parameter was changed.
- [ ] 6.4 [E] Measure SwiftUI re-evaluation while standing with `Self._printChanges()` on a device; close `stabilize-ios-navigation-pipeline` 10.4. **Human step (Erik):** needs a device (`Self._printChanges()` while standing).
- [ ] 6.5 [C] Write `docs/pilot-readiness/hardware/RESULT_SUMMARY.md`: median/P90 error per site, correct-aisle rate, recommended beacon spacing, recommended pilot mode (A/C/B), open risks. Gerüst `RESULT_SUMMARY.md` angelegt (Mensch/Auswertung: Messdaten abwarten).

## 7. Pilot Store Preparation (after a store agreed)

- [ ] 7.1 [C] Create the store beacon plan with the planner (positions on the store layout, mounting photos placeholders); hand it to the store contact before mounting. (Mensch: wartet auf vereinbarten Markt und Planer.)
- [ ] 7.2 [C] Human step: mount beacons, measure coordinates, enter them in the admin beacon management and layout together with the data entry (`prepare-pilot-store-operations`). (Mensch: vor Ort.)
- [ ] 7.3 [C]+[E] Run the protocol in the store; fixtures, report; [E] closes `stabilize-ios-navigation-pipeline` 13.6 when its expectations hold. Waiting for an agreed store.

## 8. Verification and Handover

- [ ] 8.1 [E] `swift test` green incl. new field tests; [C] `python -I -m unittest discover scripts/field` green; both run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 8.2 [C] Pull request `pilot/field-measurement` → `pilot/first-store` after section 4 and again after 6.5; [E] pull request `pilot/field-replay` after 5.2 and 6.3; both update `STATUS.md`. PR `pilot/field-measurement` → `pilot/first-store` für Abschnitt 4 offen; zweiter PR nach 6.5 (Mensch).
