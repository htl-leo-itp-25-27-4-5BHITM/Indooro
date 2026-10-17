# MCindooroApp Testing Notes

## Current Xcode test-target status

The Xcode project currently defines only one native target:

```text
MCindooroApp
```

There is no `MCindooroAppTests` XCTest target in:

```text
swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj/project.pbxproj
```

Because the project has no existing test target, API/model tests were not added
directly to the `.pbxproj`. Creating XCTest targets by hand in a populated
Xcode project is fragile and can easily corrupt build phases, scheme settings,
or user state.

## Recommended next step

Create a new XCTest target in Xcode named:

```text
MCindooroAppTests
```

Then add unit tests for:

- `RecipeSummary`
- `RecipeDetail`
- `RecipeProductMappingResponse`
- `UpsellPlanResponse`
- `UpsellSuggestionResponse`
- backward-compatible `ShoppingListItem` decoding with recipe and upsell fields
- pure merge/deduplication behavior for recipe-sourced and upsell-sourced
  shopping-list items

The tests should use local JSON fixtures only and must not perform real network
calls.


## Fixtures, contract tests and CI (add-ios-app-test-target)

- `Fixtures/` holds anonymous live responses captured from LeoCloud with `curl`
  (`stores.json`, `store-layout-current.json`, `products-search-milch.json`, `recipes.json`,
  `recipe-detail.json`, `recipe-product-mapping.json`) and hand-made edge cases
  (malformed product list, rotated shelf without label, shopping list v1, upsell plan).
  Refresh a live fixture with the same `curl` call; never put credentials or personal data into it.
- The pure Foundation models from `indooroApp/Models/` are part of the SwiftPM target, so
  `swift test` also checks the backend contract (decoding of the fixtures) and the shopping list model.
- The unit test bundle `MCindooroAppTests` (host app `MCindooroApp`, synchronized folder
  `MCindooroAppTests/`, shared scheme `MCindooroApp`) covers what does not build in the package
  (`ShoppingListManager`, later `AppEnvironment`). It was created by `scripts/ios/add_unit_test_target.rb`
  (xcodeproj gem, idempotent), not by hand. Run it with
  `xcodebuild test -project MCindooroApp.xcodeproj -scheme MCindooroApp -destination 'platform=iOS Simulator,name=iPhone 16 Pro' CODE_SIGNING_ALLOWED=NO`.
- `scripts/ios/install-debug-on-device.sh` builds the Debug app for a connected iPhone and installs it
  with `devicectl` (device must be plugged in, unlocked and trusted).
- `.github/workflows/ios.yaml` runs on pull requests to `pilot/first-store` and `main`
  (`swift test`, simulator build, and `xcodebuild test` as soon as `MCindooroAppTests/` contains Swift files).

## Navigation test package (`swift test`)

`swift/indooro-EinkaeuferFinal/Package.swift` defines the SwiftPM package
`IndooroNavigationCore`. It compiles only the platform-independent navigation
sources from `indooroApp/` (layout model, graph, Kalman filter, beacon solver,
measurement store, estimator, walkable projector, positioning pipeline, navigation
session core, tour planner, navigation config, record/replay types) and adds the
test target `IndooroNavigationCoreTests`. The Xcode app target is not affected;
the package exists so navigation logic can be tested on macOS without a simulator.

Run from `swift/indooro-EinkaeuferFinal`:

```bash
swift test
```

Test support lives in `Tests/IndooroNavigationCoreTests/`:

- `TestLayouts`: loads `Resources/layout-demosupermarkt.json` and injects a
  beacon grid (default one beacon per 8 m x 8 m cell).
- `SyntheticWalk`: walks a polyline with configurable speed, noise, outliers and
  dropouts, tick 0.35 s, seedable (`SplitMix64`).
- `SyntheticRecording`: builds replayable `NavigationRecordLine`s (measurements,
  truth, events) from truth movements on the demo layout.
- The measured baseline numbers (before the fixes) are in `NavigationFixtures/BASELINE.md`.

## Recording and replaying a store walk

DEBUG builds can record raw measurements and replay them offline against the
production pipeline (`PositioningPipeline`, `NavigationSessionCore`, `TourPlanner`).
Release builds contain no recorder.

1. **Record**: in a DEBUG build open Einstellungen -> Debug and switch on
   „Messungen aufzeichnen“. The app writes JSON Lines to
   `Documents/NavigationRecordings/<ISO timestamp>.jsonl` (measurements, layout
   identity, tour events, calibrations). Nothing is sent to a server. A long press
   (0.6 s) on the map writes a `truth` line at that point without moving the
   position; use it to mark where you actually stand. Switch the toggle off to
   flush and close the file.
2. **Share**: the same section offers „Aufzeichnung teilen“ (system share sheet,
   e.g. AirDrop to the Mac). The file name is a timestamp; it contains no device
   identifier. Check it before committing.
3. **Add a fixture**: copy the file to
   `NavigationFixtures/recordings/<name>.jsonl` (real walks) and add a test that
   loads it with `NavigationRecordLine.parse(jsonl:)` and calls
   `NavigationReplay.run(recording:layout:config:)` with the matching layout
   (bundle the layout JSON under `Tests/IndooroNavigationCoreTests/Resources/`).
   Replays run against one layout; the `layout` line only documents which one was
   active. Small synthetic fixtures are generated in tests instead (see
   `NavigationReplayTests`).
4. **Run**: `swift test --filter NavigationReplayTests`. `ReplayMetrics` reports
   reroutes per minute, active-stop changes without an event, projected jumps,
   mean and 95th-percentile lag to truth (meters), off-route detection delay,
   low-confidence toggles and planning time per event. Two replays of the same
   file must give identical metrics (planning wall time excluded); a metric that
   differs is a determinism bug. Metrics are printed as `REPLAY <name> ...` lines.

The app build is still verified with:

```bash
xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj \
  -scheme MCindooroApp -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
```

## UI-Tests (add-ios-pilot-ui-tests)

Die XCUITests im Target `MCindooroAppUITests` prüfen die Pilot-Abläufe in der App:
Planung, Tour, Regaltext, „Ich bin hier“, Offline-Start, QR-Anker und Store-Wechsel per Scan.

Ausführen (aus dem Repo-Root):

```bash
sh scripts/ios/run-ui-tests.sh
```

Das Skript startet `scripts/dev/mock_mobile_api.py` mit `MOCK_DATASET=ui-test-store` auf
127.0.0.1:18090, wartet, bis der Mock antwortet, führt `xcodebuild test` für das Scheme
`MCindooroApp` aus (Unit- und UI-Tests) und beendet den Mock am Ende. Der Simulator ist der
gerade gebootete iPhone, sonst der erste verfügbare; mit `UI_TEST_DEVICE_UDID` lässt er sich
festlegen. Der Exitcode von `xcodebuild` wird durchgereicht.

- **Mock-Datensatz**: `MOCK_DATASET=ui-test-store` liefert zwei Filialen (`UITEST-001` „UI-Testmarkt“,
  `UITEST-002` „UI-Testmarkt 2“), deren Layouts, 30 Produkte und die Produktsuche aus
  `swift/indooro-EinkaeuferFinal/Fixtures/ui-test-store/`. Ohne die Variable bleibt der alte
  Datensatz mit `MOCK-QR-001`/`MOCK-QR-002` unverändert.
- **Launch-Zustand**: Die App startet mit `-uiTesting` (Modus „Ohne Ortung“, keine
  Standortabfrage, nur DEBUG-Builds) und `INDOORO_API_BASE_URL=http://127.0.0.1:18090/api`.
  Die Einkaufsliste und eine aktive Tour werden über Argument-Domain-Werte geleert, sodass jeder
  Test frisch startet.
- **Helfer**: `MCindooroAppUITests/UITestSupport.swift`. Warten nur über `waitForExistence` und
  `waitForNonExistence`, keine Sleeps. Der Test bricht mit klarer Meldung ab, wenn der Mock fehlt
  oder den falschen Datensatz liefert.
- **Test-Hooks**: `accessibilityIdentifier` nur in `StoreMapPage` (`storeCard-<Code>`,
  `positionBanner`), `MapView` (`storeMap`) und `AnchorScannerView` (`debugPayloadField`).

Abgedeckte Abläufe:

| Datei | Test | Ablauf |
|---|---|---|
| `TourFlowUITests.swift` | `testTourStartsAtEntranceAndRoutesFromLastStopAfterDone` | Drei Produkte planen, Store öffnen, Tour starten, „Route ab Eingang“, „Erledigt“, „Route ab <Regal>“ |
| `ShelfTextUITests.swift` | `testPlannedProductShowsShelfTextInWords` | Regaltext in Worten in Planung und Einkaufen, kein roher layoutCode in der Planung |
| `PositionUITests.swift` | `testIchBinHierSetsPositionWithTapOnMap` | „Ich bin hier“, Tipp auf die Karte, Hinweis und „Position ungenau“ verschwinden |
| `SearchUITests.swift` | `testAmpersandQueryFindsOnlyTheMatchingProduct`, `testTypoShowsNoResultHintWithoutAddButton`, `testPlusQueryWithoutResultsShowsHintAndDoesNotCrash` | Suche mit „&“, Tippfehler und „+“: richtiges Produkt bzw. „Keine Treffer für …“ |
| `StudyExportUITests.swift` | `testSessionWithTwoTasksAndExportPreparation` | Testleitung (DEBUG `INDOORO_STUDY_MODE=1`): Test-ID, zwei Aufgaben, Export vorbereiten, Löschen |
| `OfflineStartUITests.swift` | `testOfflineStartOpensStoreFromOfflineCopy` | Online laden, neu starten ohne API, Store aus der Offline-Kopie |
| `AnchorScanUITests.swift` | `testAnchorPayloadSetsPositionAndClosesScanner`, `testUnknownAnchorShowsHintAndKeepsScannerOpen` | Anker-Payload setzt die Position, unbekannter Anker zeigt den Hinweis |
| `StoreSwitchUITests.swift` | `testScanOfOtherStoreSwitchesStoreAndSetsPositionWithOneScan` | Scan einer anderen Filiale, Wechsel-Abfrage, ein Scan setzt die Position |

Der Scanner läuft im Simulator ohne Kamera. Die Tests nutzen deshalb den DEBUG-Fallback
„Payload einfügen“ mit dem Button „Übernehmen“. Ein Kamera-Systemdialog wird über einen
Interruption-Monitor bestätigt.

Bekannte Grenzen:

- Die Produktsuche mit Sonderzeichen (z. B. „Milch & Käse“) ist nicht abgedeckt. `ProductSearchStore`
  und `BeaconManager` kodieren den Suchtext mit `.urlQueryAllowed`, das `&` und `+` nicht
  escaped. Der Test nutzt nur einfache Begriffe; der Sonderzeichen-Test wartet auf
  `prepare-pilot-ios-build`.
- Die Trefferzeile der Produktsuche zeigt den rohen layoutCode („Regal 520/2/1/1“). Die UI-Tests
  prüfen den Regaltext daher in Planung und Einkaufen, nicht in der Trefferliste.
- Die Tests hängen an den deutschen Labels der Oberfläche (z. B. „Erledigt“, „Einplanen“,
  „Tour starten“). Eine Umbenennung bricht die Tests.
- Der Kamera-Pfad mit echtem QR-Code ist nicht abgedeckt; das ist ein Gerätetest.

CI: `.github/workflows/ios.yaml` startet den Mock vor dem Schritt „App unit and UI tests“ und
wiederholt den `xcodebuild test`-Lauf einmal bei einem Simulator-Boot-Fehler.
