## 1. Setup

- [x] 1.1 Start when the prerequisite changes are merged; branch `pilot/ios-ui-tests`; validate this change. (prerequisites merged except `prepare-pilot-ios-build`; branch `pilot/ios-ui-tests` merged with `pilot/first-store` `ae6f20f`)
- [x] 1.2 Add UI testing bundle `MCindooroAppUITests`. Done without Xcode UI: `scripts/ios/add_ui_test_target.rb` (xcodeproj gem, idempotent) creates target, synchronized folder and registers it in the shared scheme; own commit `423ca2e`.

## 2. Fixture Mode

- [x] 2.1 Create `swift/indooro-EinkaeuferFinal/Fixtures/ui-test-store/` (layout with entrance, 6 labeled shelves, 2 anchors; 30 products). (`Fixtures/ui-test-store/`: 2 stores, layouts with entrance, 6 labeled shelves and anchors A1/A12 resp. B7, 30 products; served by the mock)
- [x] 2.2 Fixture mode, adapted: `prepare-pilot-ios-build` (`AppEnvironment`) is not merged, so the app is not changed to read bundled JSON. Instead `-uiTesting` (DEBUG only, `BeaconManager.isUITesting`: mode „Ohne Ortung“, no location prompt) plus `INDOORO_API_BASE_URL` pointing to `scripts/dev/mock_mobile_api.py` with `MOCK_DATASET=ui-test-store`; the shopping list is cleared through launch arguments (argument domain). Re-evaluate with `AppEnvironment` once merged.
- [x] 2.3 Accessibility identifiers only in Erik-owned files: `storeMap`, `positionBanner`, `storeCard-<code>`, `debugPayloadField`. Everything else is found by its visible German label, so no change in Person A files is needed.

## 3. Tests

- [x] 3.1 Search „Milch & Käse“ and a typo: `SearchUITests` (ampersand finds only the matching fixture product `Milch & Käse Frühstücksbox 300g`; typo and `a+b` show „Keine Treffer für …“). Encoded query items come from `prepare-pilot-ios-build` 4.1; done on `integration/ios-person-a`.
- [x] 3.2 Tour: `TourFlowUITests` (3 products planned, tour start, „Route ab Eingang“, „Erledigt“, „Route ab <Regal>“).
- [x] 3.3 „Ich bin hier“: `PositionUITests`. Also `ShelfTextUITests` (shelf in words), `AnchorScanUITests` (valid and unknown anchor through the DEBUG payload field) and `StoreSwitchUITests` (one scan across stores).
- [x] 3.4 Offline start: `OfflineStartUITests` (online load, relaunch with unreachable API, store from the offline copy).
- [x] 3.5 Study mode export: `StudyExportUITests` (DEBUG `INDOORO_STUDY_MODE=1`; invalid id „Anna“ blocked, session T01, two tasks, „Gefunden“ / „Hilfe gebraucht“, export prepared, all sessions deleted). The test checks the UI only; file formats are covered by `MCindooroAppTests/StudyExportTests`.

## 4. CI and Handover

- [x] 4.1 UI tests run in `.github/workflows/ios.yaml` (mock started before `xcodebuild test`, one retry on simulator boot failure). Green run: see the pull request.
- [x] 4.2 `TESTING.md` updated; `STATUS.md` updated; pull request `pilot/ios-ui-tests` → `pilot/first-store` (changes `project.pbxproj`: merge before or coordinated with Person A's PR).
