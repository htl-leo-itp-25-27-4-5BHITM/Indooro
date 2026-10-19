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
  `xcodebuild test -project MCindooroApp.xcodeproj -scheme MCindooroApp -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -skipPackagePluginValidation CODE_SIGNING_ALLOWED=NO`.
  Das lokale Paket `Packages/IndooroKit` nutzt ein Build-Tool-Plugin (swift-openapi-generator); deshalb ist
  `-skipPackagePluginValidation` in allen `xcodebuild`-Aufrufen dieses Projekts Pflicht.
  Das Paket ist nur am App-Target `MCindooroApp` gelinkt, nicht am Test-Bundle: ein statisches Produkt in zwei
  Targets ist ein Linkfehler, und dynamische Frameworks im Test-Bundle lassen den Test-Host beim Start hängen
  ("test runner hung before establishing connection"). Das Skript `scripts/ios/add_indoorokit_package.rb` setzt das.
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

### Feldtag: eine Aufnahme in einem Befehl

`docs/pilot-readiness/hardware/TESTRAUM_TAG.md` ist die Checkliste fuer den Testraum. Kurzform:

- Die Debug-Aufnahme enthaelt zusaetzlich `scan`-Zeilen (`major`, `minor`, `rssi`) fuer iBeacons ohne Layout-Treffer; der Replay ignoriert sie.
  Der Recorder zeigt waehrend der Aufnahme `REC · n Marker` auf der Karte, jeder Long-Press vibriert, und die Einstellungen listen alle Aufnahmen
  (nicht nur die letzte). Debug-Builds zeigen `Documents/NavigationRecordings/` in der Dateien-App (`UIFileSharingEnabled`, nur Debug).
- `scripts/field/fetch_layout.py --store <storeCode> --out <datei>` holt das aktive Layout lesend.
- `scripts/field/analyze_walk.sh [aufnahme.jsonl] --layout <datei>` anonymisiert eine Kopie, spielt sie ueber
  `FIELD_REPLAY_RECORDING=<aufnahme> FIELD_EXPORT_LAYOUT=<layout> swift test --filter FieldExportTests/testFieldReplayOfSingleRecording`
  durch dieselbe Pipeline und schreibt den Report (`scripts/field/README.md`).
- `NavigationFixtures/synthetic/` enthaelt die erkennbar synthetische Probe-Aufnahme (`scripts/field/make_synthetic_walk.py`).
  Sie ist keine Messung und gehoert nie in `recordings/`.

The app build is still verified with (konkretes Simulator-Ziel; das generische Ziel mit `-sdk iphonesimulator`
ist nicht unterstützt, siehe „Build-Konfigurationen und Schemes“ unten):

```bash
xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj \
  -scheme MCindooroApp -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -skipPackagePluginValidation build CODE_SIGNING_ALLOWED=NO
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

- Die Produktsuche mit Sonderzeichen (z. B. „Milch & Käse“) ist nur per Unit-Test abgedeckt
  (`ProductEndpointTests`): `ProductEndpoint` kodiert `& + = # ?` im Suchtext, damit er keine
  Parameter wie `storeCode` einschleusen kann. Ein UI-Test dafür fehlt noch.
- Die Trefferzeile der Produktsuche zeigt den rohen layoutCode („Regal 520/2/1/1“). Die UI-Tests
  prüfen den Regaltext daher in Planung und Einkaufen, nicht in der Trefferliste.
- Die Tests hängen an den deutschen Labels der Oberfläche (z. B. „Erledigt“, „Einplanen“,
  „Tour starten“). Eine Umbenennung bricht die Tests.
- Der Kamera-Pfad mit echtem QR-Code ist nicht abgedeckt; das ist ein Gerätetest.

CI: `.github/workflows/ios.yaml` startet den Mock vor dem Schritt „App unit and UI tests“ und
wiederholt den `xcodebuild test`-Lauf einmal bei einem Simulator-Boot-Fehler.

## Ankunftsvorschlag (add-arrival-suggestion)

Während einer Tour im Modus „Mit Ortung“ erscheint „Bist du bei <Regal>?“, sobald die Position
vertrauenswürdig ist und der Kunde am aktiven Stopp verweilt. Der Vorschlag erledigt nie selbst einen
Stopp: „Ja, erledigt“ läuft über den bestehenden Erledigt-Pfad, „Noch nicht“ sperrt Vorschläge für
diesen Stopp 30 s. Nach „Ja, erledigt“ kommt für denselben Stopp kein neuer Vorschlag, bis der aktive
Stopp wechselt.

Code: `indooroApp/Utilities/ArrivalSuggestionDetector.swift` (pur, Zeit wird injiziert),
`indooroApp/Utilities/NavigationSession.swift` (Verdrahtung, Zähler), `indooroApp/Views/Main/StoreMapPage.swift` (Overlay).

### Defaults

| Parameter | Wert | Konstante | Status |
|---|---|---|---|
| Radius R | max(3 m, gemessener Median-Positionsfehler) | `ArrivalSuggestionConfig.defaultRadiusFloorMeters` (3 m) | Untergrenze vorläufig, kein Messwert vorhanden |
| Verweildauer T | 5 s | `defaultDwellSeconds` | vorläufig |
| Sperre nach „Noch nicht“ | 30 s pro Stopp | `defaultSuppressionSeconds` | Designwert |
| Lückenregel | Lücke zwischen Samples > 3 s setzt die Verweildauer zurück | `ArrivalSuggestionDetector.maxSampleGapSeconds` | Designwert |

Begründung: `docs/pilot-readiness/hardware/RESULT_SUMMARY.md` enthält noch keine Messdaten („Keine
Messdaten – kein Parameter wird geändert“). Deshalb gilt R = 3 m als Untergrenze, bis der Median-Fehler
aus den Reports feststeht. T = 5 s soll verhindern, dass ein bloßes Vorbeigehen am Regal als Ankunft
gilt. Die 30 s Sperre verhindert, dass der Vorschlag nach „Noch nicht“ sofort wieder erscheint. Alle
drei Werte sind vorläufig und nicht gemessen.

### Anpassen, sobald gemessen wurde

1. Median-Positionsfehler an Markern aus den Reports in `RESULT_SUMMARY.md` (Abschnitt 1) übernehmen.
   Keine Änderung ohne Nachweis nach `PARAMETER_ANALYSIS.md`.
2. R: Der Messwert gehört an `ArrivalSuggestionConfig.defaults(measuredMedianErrorMeters:)`. Achtung:
   Der Aufruf in `NavigationSession.arrivalSuggestionConfig` übergibt heute keinen Messwert, es gilt
   nur die 3-m-Untergrenze. Dort muss der gemessene Wert eingebaut werden.
3. T: `ArrivalSuggestionConfig.defaultDwellSeconds` in `ArrivalSuggestionDetector.swift` ändern.
4. Tests anpassen, die feste Radien oder Zeitwerte annehmen (`ArrivalSuggestionDetectorTests`,
   `ArrivalSuggestionSessionTests`); danach `swift test` und `xcodebuild test` laufen lassen.
5. Gemessene Werte und Begründung in `RESULT_SUMMARY.md` (Abschnitt 4) eintragen.

### Feldtuning (nur DEBUG)

`INDOORO_ARRIVAL_RADIUS_M` und `INDOORO_ARRIVAL_DWELL_S` überschreiben R und T in DEBUG-Builds
(Umgebungsvariablen, z. B. im Xcode-Scheme). Ungültige Werte und Werte <= 0 werden ignoriert.
Release-Builds lesen die Variablen nicht. Die Überschreibung dient Tests am Gerät, nicht dem Pilotbetrieb.

### Studienzähler

Die Zähler `arrivalSuggestionShownCount`, `arrivalSuggestionAcceptedCount` und
`arrivalSuggestionRejectedCount` stehen als drei neue Spalten am Ende der Study-CSV (Header jetzt 19
Spalten). Der Importer in `scripts/pilot-eval` liest sie als optional; Dateien mit den bisherigen
16 Spalten bleiben lesbar.

### Tests

- Unit (SwiftPM): `Tests/IndooroNavigationCoreTests/ArrivalSuggestionDetectorTests.swift`, inklusive
  Replay-Test (`swift test --filter ArrivalSuggestionDetectorTests`).
- Unit (App): `MCindooroAppTests/ArrivalSuggestionSessionTests.swift` (Tour-Modus, Ja/Noch nicht,
  Stopp-Wechsel, Erledigt).
- UI: `MCindooroAppUITests/ArrivalSuggestionUITests.swift` prüft nur den negativen Fall: Im Modus
  „Ohne Ortung“ erscheint kein Vorschlag, und „Erledigt“ schließt den Stopp weiterhin ab. Der positive
  Pfad fehlt im UI-Test, weil Mock-Positionen nie als vertrauenswürdig gelten. Er ist durch die
  Unit-Tests abgedeckt.

## Build-Konfigurationen und Schemes (modernize-ios-client-architecture, Phase 2a)

Die Backend-Basis-URL kommt aus `Config/*.xcconfig` über `INDOORO_API_BASE_URL` in die Info.plist
(`IndooroAPIBaseURL = $(INDOORO_API_BASE_URL)`). `AppEnvironment.apiBaseURL` liest sie; in DEBUG-Builds
hat die Umgebungsvariable `INDOORO_API_BASE_URL` weiterhin Vorrang (UI-Tests, Mock auf 127.0.0.1:18090).

| Scheme | Build-Konfiguration | xcconfig | Backend |
|---|---|---|---|
| `MCindooroApp` | `Debug` / `Release` (unverändert) | `Shared.xcconfig` / `Release.xcconfig` | LeoCloud |
| `MCindooroApp (Local)` | `Debug-Local` | `Debug-Local.xcconfig` | `http://localhost:8080/api` |
| `MCindooroApp (LeoCloud)` | `Debug-LeoCloud` | `Debug-LeoCloud.xcconfig` | `https://it220209.cloud.htl-leonding.ac.at/api` |
| `MCindooroApp (Release)` | `Release` | `Release.xcconfig` | LeoCloud (HTTPS) |

- Die Konfigurationen und Schemes legt `scripts/ios/add_build_configurations.rb` an (xcodeproj gem,
  idempotent). Das bestehende Scheme `MCindooroApp` bleibt unverändert.
- App Transport Security: Es gibt keinen globalen ATS-Schalter (`NSAllowsArbitraryLoads` war nie gesetzt).
  Nur `Debug-Local` bekommt die Ausnahme `NSExceptionAllowsInsecureHTTPLoads` für `localhost`, über das Define
  `INDOORO_LOCAL_HTTP` in der Info.plist (`INFOPLIST_PREPROCESS`). Release und LeoCloud haben keine ATS-Ausnahme.
- Das Scheme `MCindooroApp (Release)` führt die Tests in `Debug` aus, weil `@testable import` ohne
  `ENABLE_TESTABILITY` nicht funktioniert.

Simulator-Build aller Schemes mit konkretem Ziel (Beispiel Local):

```bash
xcodebuild build -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj \
  -scheme 'MCindooroApp (Local)' -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -skipPackagePluginValidation CODE_SIGNING_ALLOWED=NO
```

Bekannte Grenze: `-sdk iphonesimulator` zusammen mit `-destination 'generic/platform=iOS Simulator'` schlägt
fehl, weil das Build-Tool-Plugin von swift-openapi-generator (Werkzeug `swift-openapi-generator`, das
`_OpenAPIGeneratorCore` linkt) dann für iOS statt für den Mac gebaut wird; `_OpenAPIGeneratorCore`
bricht mit „is only to be used by swift-openapi-generator itself“ ab (`#error` für os(iOS)). Ohne `-sdk`
funktioniert das generische Ziel. Verwende deshalb für Simulator-Builds und Tests immer ein konkretes Ziel
(`platform=iOS Simulator,name=…`); CI (`.github/workflows/ios.yaml`) tut das bereits.

## Manuelle Smoke-Checkliste (vor jedem Pilot-Build)

Die Checkliste deckt die Abläufe ab, die Unit- und UI-Tests nicht erreichen (Kamera, Bluetooth, echte Position).
Sie wird gegen Debug-Local (lokales Backend), gegen LeoCloud und auf einem Gerät mit Beacons durchlaufen
(openspec `modernize-ios-client-architecture` 15.4). Ergebnis mit Datum, Build-Nummer, Konfiguration und Gerät festhalten.

Vorbereitung: Scheme `MCindooroApp (LeoCloud)` oder `MCindooroApp (Local)` starten; Einkaufsliste leer; keine aktive Tour.

1. **Debug-Modus-Tour**: Einstellungen > Debug. Produkte einplanen („Einplanen“), Tour starten („Tour starten“),
   „Route ab Eingang“, einen Stopp mit „Erledigt“ abschließen, danach „Route ab <Regal>“. Keine Abstürze; die
   Route führt zum nächsten Stopp.
2. **Rezept hinzufügen**: Tab Rezepte, ein Rezept öffnen, Zutaten auf die Einkaufsliste setzen. Die Zutaten
   erscheinen mit Menge und Regaltext in Worten, ohne rohe layoutCodes. Doppeltes Hinzufügen erzeugt keine Dubletten.
3. **Liste importieren**: Eine `.indoorolist`-Datei öffnen (Dateien-App oder Share-Sheet, Beispiel:
   `Fixtures/shopping-list-v1.json` als `.indoorolist` kopiert). Die App öffnet den Dialog „Liste importieren“
   (Abschnitt „Importieren“). Nach dem Import sind alle Positionen da; die bestehende Liste bleibt erhalten.
4. **Store-Auswahl**: Filialliste öffnen, eine Filiale wählen (Store-Karte). Die Karte lädt und die Produktsuche
   liefert Treffer dieser Filiale. Filialen ohne Kartenposition erscheinen nur in der Chip-Zeile „Ohne Kartenposition“.
5. **AR-Start** (nur Gerät): Tour mit Ortung starten, AR-Navigation öffnen, Kamera-Berechtigung erteilen, Kamerabild
   und Routenhinweis erscheinen. Zurück zur Karte ohne Absturz.
6. **Upsell-Prompt**: Beim Planen oder Einkaufen erscheint, sofern Vorschläge kommen, das Sheet „Zu <Produkt>
   passt vielleicht noch:“. Der Vorschlag lässt sich übernehmen oder schließen; geschlossen heißt: nichts auf der Liste.
   Das Sheet erscheint nicht mehrfach für denselben Auslöser in einer Sitzung. (Die 429-Behandlung ist Task 13.3 und
   noch offen; bis dahin nicht als Fehler werten, wenn nach einer Serie von Anfragen keine Vorschläge kommen.)
7. **Low-Confidence-Banner**: Modus „Mit Ortung“ mit weniger als drei Beacons. Der Hinweis „Position ungenau.“
   erscheint, die Route-Angabe entfällt. Im Modus „Ohne Ortung“ erscheint kein Ankunftsvorschlag („Bist du bei …?“).
   Auf dem Gerät zusätzlich prüfen, dass der Blue Dot degradiert dargestellt wird (fix-ios-contract-and-spec-drift 11.5).
8. **Offline-Start**: Flugmodus, App neu starten. Der zuletzt geladene Store startet aus der Offline-Kopie.

Ergebnis: Jeder Punkt ist „ok“ oder „Fehler: <Beschreibung>“. Fehler mit Build-Nummer und Konfiguration melden.
