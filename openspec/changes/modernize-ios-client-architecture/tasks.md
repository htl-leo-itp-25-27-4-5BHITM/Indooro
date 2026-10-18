## 1. Preparation

- [x] 1.1 Confirm `fix-ios-contract-and-spec-drift` is implemented or explicitly sequenced before this change. (Implementiert in 84d0722, gemergt über PR #143 (28b22d2); seine 6 offenen Punkte sind manuelle Gerätetests und bleiben dort offen.)
- [ ] 1.2 Record baseline metrics in DEBUG: snapshot rebuild time, main-thread time per positioning tick, app launch time, app bundle size. (Mensch/Gerät: Messung auf einem Gerät mit Beacons; Simulator-Werte nicht als Baseline verwenden.)
- [x] 1.3 Record the manual smoke flow (debug mode tour, recipe add, list import, store selection, AR start) as a checklist in `swift/indooro-EinkaeuferFinal/TESTING.md`. (Abschnitt „Manuelle Smoke-Checkliste“ mit Upsell-Prompt und Low-Confidence-Banner; Durchlauf auf Gerät ist Mensch-Aufgabe, siehe 15.4.)

## 2. Tooling And Configuration

- [x] 2.1 Add `Config/Shared.xcconfig`, `Config/Debug-Local.xcconfig`, `Config/Debug-LeoCloud.xcconfig`, and `Config/Release.xcconfig` with `INDOORO_API_BASE_URL`. (`swift/indooro-EinkaeuferFinal/Config/`, Werte wie design Decision 5.)
- [x] 2.2 Add build configurations and schemes `MCindooroApp (Local)`, `MCindooroApp (LeoCloud)`, `MCindooroApp (Release)`. (Konfigurationen Debug-Local/Debug-LeoCloud und xcconfig-Basen per `scripts/ios/add_build_configurations.rb`; Schemes geteilt; Scheme `MCindooroApp` unverändert. Verifiziert: Builds der drei neuen Schemes auf iPhone-Simulator grün.)
- [x] 2.3 Add `IndooroAPIBaseURL` to `Info.plist` and remove `NSAllowsArbitraryLoads`; add the localhost ATS exception only for `Debug-Local`. (`NSAllowsArbitraryLoads` war nie gesetzt, es gibt keinen ATS-Eintrag außer dem neuen Debug-Local-Eintrag über Define `INDOORO_LOCAL_HTTP`; `AppEnvironment.resolveAPIBaseURL` liest den Wert, Tests in `AppEnvironmentTests`. Verifiziert: Info.plist der Local-Builds enthält die Ausnahme, Release und LeoCloud nicht.)
- [x] 2.4 Add `Assets.xcassets` with AppIcon and AccentColor. (Bereits vorhanden: `indooroApp/Assets.xcassets` mit AppIcon 1024 px und AccentColor; nicht dupliziert. AccentColor-Wert weicht vom Design ab (0.000/0.430/0.360 statt 0.12/0.46/0.39), bewusst unverändert.)
- [x] 2.5 Move unused layout JSONs to `swift/indooro-EinkaeuferFinal/Fixtures/Layouts/`, move `presentation-airdrop-swift/` to `presentations/swift-airdrop/`, and exclude `README.md` from the app target. (`layout-demosupermarkt.json` nach Fixtures/Layouts; `layout.json` bleibt, von BeaconManager geladen; `docs/presentation-airdrop-swift` nach `presentations/swift-airdrop`; `README.md` ist kein Mitglied des App-Targets.)
- [x] 2.6 Add `xcuserdata/` and `*.xcuserstate` to `.gitignore` and remove tracked user state files. (Done 2026-09-21.)

## 3. Package Skeleton And Tests

- [ ] 3.1 Create `swift/indooro-EinkaeuferFinal/Packages/IndooroKit/Package.swift` (tools 6.0, platform iOS 18) with the targets from design Decision 1. (Phase 1: nur IndooroNetworking; Package.swift nutzt iOS 18.5 wie das App-Target.)
- [ ] 3.2 Add test targets for Models, Navigation, Networking, Persistence, and Upsell plus `IndooroTestSupport`.
- [ ] 3.3 Add the local package to `MCindooroApp.xcodeproj` and link the feature targets.
- [ ] 3.4 Copy the JSON fixtures from `fix-ios-contract-and-spec-drift` into `IndooroTestSupport/Resources`.

## 4. Models Extraction

- [x] 4.1 Move all model files to `IndooroModels`, mark them `public` and `Sendable`. (IndooroModels: 9 Dateien verschoben, public + Sendable; BeaconUUIDNormalizer ausgelagert; Codable unverändert)
- [x] 4.2 Add `LayoutDecodingTests`, `StoreDecodingTests`, `BeaconUUIDNormalizerTests`, `RecipeDecodingTests`, `UpsellDecodingTests`, and `TransferPackageTests`. (IndooroModelsTests: 41 Tests; IndooroKit 132, SP 281, App-Unit 45)

## 5. Navigation Extraction

- [ ] 5.1 Move the sources of the local `IndooroNavigationCore` package (`swift/indooro-EinkaeuferFinal/Package.swift`, delivered by `stabilize-ios-navigation-pipeline`: `IndoorGraph` with binary heap, turn-averse A*, `distances(from:)`; `BeaconPositionSolver`, `BeaconMeasurementStore`, `PoseFusionService` estimator, `WalkableProjector`, `PositioningPipeline`, `NavigationSessionCore`, `TourPlanner`, `NavigationReplay`, `KalmanFilter`, `StabilizedNavigationConfig`, `LayoutData`) into `IndooroNavigation`; `ShoppingStopResolver` and the planning-side stop mapping move with them. `Pathfinder`, `MapMatcher`, `RouteManager`, and `NavigationStateMachine` no longer exist.
- [ ] 5.2 Remove the `IndooroNavigationCore` target from `Package.swift` once its sources live in `IndooroNavigation`; keep the file list and test target mapping equivalent.
- [ ] 5.3 Move `Tests/IndooroNavigationCoreTests` (graph, routing, estimator, projector, measurement store, session, tour planner, replay tests and `Resources/layout-demosupermarkt.json`) into the `IndooroNavigation` test target as the characterization tests; add a `layout.json` fixture next to the demo layout where a test needs it. Do not re-record expectations; they encode the behavior of `stabilize-ios-navigation-pipeline`.
- [ ] 5.4 Replace `NavigationSession.attach(to:)`'s dependency on `BeaconManager` by the `PositionSnapshot` stream of task 9.3 without changing `NavigationSessionCore`; session tests must keep passing unchanged.
- [ ] 5.5 Add a `LayoutGraphSnapshot` (`Sendable`, immutable) wrapping the graph that `stabilize-ios-navigation-pipeline` already builds once per layout revision, so `PositioningEngine` and `ShoppingSessionModel` share it. No new graph or planner logic.
- [ ] 5.6 Keep the planning-time measurement of `NavigationReplay` (`planningSeconds`) and add a performance test for the 25-stop tour planning (budget 16 ms on CI simulator × 3 tolerance).

## 6. Networking

- [x] 6.1 Implement `APIEnvironment`, `Endpoint`, `APIClient`, `APIError`, `RetryPolicy`, and `JSONCoding` in `IndooroNetworking`. (Phase 2b: `swift/indooro-EinkaeuferFinal/Packages/IndooroKit/Sources/IndooroNetworking/` mit `APIEnvironment.swift`, `Endpoint.swift`, `APIClient.swift`, `APIError.swift`, `RetryPolicy.swift` (inkl. `RetrySleeper`/`SystemSleeper`), `JSONCoding.swift`; Session mit `waitsForConnectivity = false`, `.useProtocolCachePolicy`, `Accept`/`Accept-Language: de-AT`; `AuthorizationProvider` ist im Client nil. Verifiziert: `swift test` in `Packages/IndooroKit` grün, 91 Tests.)
- [x] 6.2 Define endpoints for every route in the `ios-backend-integration` route list. (Phase 2b: 16 Endpoint-Typen fuer alle Routen der Liste in `MobileStoreEndpoints.swift`, `LayoutEndpoints.swift`, `ProductEndpoints.swift`, `RecipeEndpoints.swift`, `UpsellEndpoints.swift`; Antworten: generierte `Components.Schemas.*` fuer Stores, Produkte, Rezepte, Upsell, Layouts als `RawJSON` (unveraendert). Timeouts 15/20/25/3 s. Tests: `EndpointRequestTests` (24), `EndpointFixtureDecodingTests` (9).)
- [x] 6.3 Add `APIClientRetryTests` with `StubURLProtocol` for 503-then-200, timeout, offline, 429, 404, and cancellation. (Phase 2b: `Tests/IndooroNetworkingTests/APIClientRetryTests.swift` (16 Tests, u. a. 503-then-200, Timeout mit drei Versuchen, Offline ohne Wiederholung, 429/404 ohne Wiederholung, Abbruch, POST nie wiederholt), `StubURLProtocol.swift` (im Testtarget), `APIErrorTests` (9), `JSONCodingTests` (7, Paritaet zu `JSONDecoder.indooro`).)
- [ ] 6.4 Replace every `URLSession.shared.dataTask` call in the app with `APIClient`. (Phase 2c+: stores migrieren einzeln; in Phase 2b unveraendert, App nutzt weiter `AppEnvironment.session`.) Phase 5 (Teilstand, bleibt offen): migriert sind `ProductSearchStore` (Produktsuche und Kategorieliste ueber `ProductCollectionEndpoint`, Antwort als `RawJSON`), `RecipeStore` (Liste, Suche, Detail, Produkt-Zuordnung ueber `RecipeEndpoints` mit `asRaw`) und `UpsellSuggestionStore` (Plan-POST ueber `UpsellPlanEndpoint`, Telemetrie und Dismiss ueber `fire`). Zurueckgestellt: `BeaconManager` (Store-Erkennung, Layout- und Katalog-Laden; positionierungskritisch, eigene Phase), `StudySessionView` (`AppEnvironment.session.data(from:)` fuer Lernsitzungen; PilotNetworking-Studienaufrufe, eigene Phase). Navigation und Tour haben keine eigenen Netzwerkaufrufe. Die migrierten Reads nutzen `RetryPolicy.interactiveRead` (eine Wiederholung, 10 s Timeout je Versuch, Fehlerfall hoechstens etwa 21 s); `idempotentRead` bleibt fuer die uebrigen Reads. Aufgabe bleibt offen, bis diese beiden Stellen migriert sind.

## 7. Type-Safe Contract

- [x] 7.1 Consume the reviewed backend contract produced by `establish-shared-api-contract` (schema export and annotations are owned by that change; do not duplicate them here).
- [x] 7.2 Use `api/openapi/indooro-mobile.yaml` as generated by `establish-shared-api-contract` task 4.1 (the export script is owned by that change).
- [x] 7.3 Add `swift-openapi-generator` (types only) to `IndooroNetworking` and write mappers to `IndooroModels`. (Phase 1: types only, endpoints moved; mappers to IndooroModels follow with 4.1.)
- [x] 7.4 Add a CI check that the Swift generator input `api/openapi/indooro-mobile.yaml` is up to date; the backend contract diff job is owned by `establish-shared-api-contract`. Evidence: `.github/workflows/ios.yaml` job `mobile-contract` runs `npm run contract:mobile:check` for iOS PRs (also for PRs to `pilot/first-store`, which `ci.yaml` does not cover); the same check stays in the `contract` job of `ci.yaml`. Checked locally: `OK: api/openapi/indooro-mobile.yaml is up to date`.

## 8. Persistence

- [ ] 8.1 Implement `ShoppingListRepository` with schema v2, atomic write, backup, corruption quarantine, debounce, and migration from `UserDefaults`. (zurückgestellt: Persistenz-Umbau mit Datenverlust-Risiko für Einkaufslisten; erst nach dem Pilot, nur mit Migrationstests.)
- [ ] 8.2 Move `LayoutCacheStore` from the fix change into `IndooroPersistence`. (zurückgestellt: Persistenz-Umbau mit Datenverlust-Risiko für Einkaufslisten; erst nach dem Pilot, nur mit Migrationstests.)
- [ ] 8.3 Add `ShoppingListRepositoryTests` for fresh install, v1 migration, corrupt file, backup recovery, and two-launch key removal. (zurückgestellt: Persistenz-Umbau mit Datenverlust-Risiko für Einkaufslisten; erst nach dem Pilot, nur mit Migrationstests.)

## 9. Positioning Split

- [ ] 9.1 Implement `BeaconRadio` protocol and `CoreLocationBeaconRadio` (ranging, BLE scan, authorization) emitting `AsyncStream<BeaconSample>`.
- [ ] 9.2 Implement `HeadingProvider` and `MotionProvider` with background delivery.
- [ ] 9.3 Implement `PositioningEngine` actor with tick loop and `AsyncStream<PositionSnapshot>`; the tick calls the existing `PositioningPipeline.tick` (measurement store, solver, estimator, projector) from `IndooroNavigation` and does not re-implement it.
- [ ] 9.4 Implement `StoreDetectionService` actor with identity refresh, lookup de-duplication, and cooldown.
- [ ] 9.5 Implement `LayoutRepository` with the server → cache → history → bundle chain.
- [ ] 9.6 Add engine tests with a fake radio and `TestClock` for warm-up, stale beacons, low confidence, jump suppression, and manual calibration; the expected values come from the `NavigationReplay` metrics of the recorded fixtures (`NavigationFixtures/`) so engine and replay agree.
- [ ] 9.7 Delete `Managers/BeaconManager.swift`.

## 10. Observable Models And Views

- [ ] 10.1 Implement `AppEnvironment`, `AppRouter`, and the `@Observable @MainActor` models from design Decision 2.
- [ ] 10.2 Move views into the feature targets and switch them to `@Environment` models.
- [ ] 10.3 Switch the root `TabView` to the `Tab` API.
- [ ] 10.4 Move upsell state from `UpsellSuggestionStore` into `UpsellModel` without behavior change and add `UpsellModelTests` for cache, pending opportunity, throttling, and session reset.
- [ ] 10.5 Delete `HeaderView`, `MapHeaderView`, `SearchOverlayView`, and `LayoutSelectionSheet` unless the layout version picker is intentionally reintroduced in the settings sheet.

## 11. Swift 6 And Logging

- [ ] 11.1 Set `SWIFT_VERSION = 6.0`, `SWIFT_STRICT_CONCURRENCY = complete`, and `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` for the app target and fix all diagnostics.
- [ ] 11.2 Replace `print` calls with `os.Logger` per design Decision 10. (Teilstand, bleibt offen: `AppLog` mit den Kategorien network, positioning, upsell, persistence und ar; `UpsellSuggestionStore`, `LayoutCacheStore` und `ARNavViewController` nutzen `os.Logger`, Kennungen mit `.private(mask: .hash)`, der Upsell-Debuglog nur in DEBUG. Zurückgestellt: die 17 `print`-Aufrufe in `BeaconManager` (Ortung, nicht anfassen).)
- [ ] 11.3 Gate the in-app debug log behind `#if DEBUG` and expose it in the settings section „Diagnose“. (zurückgestellt: der In-App-Debuglog (`debugLogLines`, 80 Zeilen) liegt im `BeaconManager`; ihn hinter `#if DEBUG` zu stellen und in „Diagnose“ anzuzeigen verlangt Änderungen an der Ortungsklasse.)

## 12. Localization And Accessibility

- [ ] 12.1 Add `Localizable.xcstrings` with development language `de` and extract all UI strings.
- [ ] 12.2 Replace ASCII transliterations in user-facing error messages with umlauts. (Teilstand, bleibt offen: `ShoppingTransferError` nutzt Umlaute, Test `ShoppingTransferErrorTests`. Zurückgestellt: die ASCII-Texte in `BeaconManager` (Layout-Antwort, Store-URL; Ortungs-Datei, nicht anfassen) und der Suchbegriff „Gemuese“ in `ShoppingFeatureViews` (Anfrage an das Backend, kein Anzeigetext).)
- [ ] 12.3 Add accessibility labels and values for the indoor map, stop markers, tour panel, and upsell sheet. (Teilstand, bleibt offen: Upsell-Sheet hat Überschrift-Trait, Hinweis und Begründung als Wert der Hinzufügen-Schaltfläche. Zurückgestellt: Karte, Stopp-Marker und Tourpanel; `StoreMapPage` und Tour sind pilotkritisch und die UI-Tests suchen dort nach Labels und Identifiern.)
- [ ] 12.4 Verify Dynamic Type up to Accessibility XL on all tabs.

## 13. Backend Rate Limiting And CI

- [ ] 13.1 Verify that `MobileRateLimitFilter` from `harden-platform-security-baseline` task 4.9 is deployed with the limits of this change's `ios-backend-integration` delta (implementation is owned by that change).
- [x] 13.2 Verify the backend rate-limit tests of `harden-platform-security-baseline` cover the plan and events limits of this change. Evidence (2026-10-18): limits 20/600 s (`plan`, `suggestions`) and 120/600 s (`events`, `dismiss`) in `application.properties` and `MobileRateLimitFilter` defaults; route mapping in `MobileRateLimitFilterTest`; `MobileRateLimitResourceTest` now also covers plan over the limit (429, `Retry-After`, service and therefore OpenAI called once) and suggestions sharing the plan budget, besides the existing events tests.
- [ ] 13.3 Handle HTTP 429 in `UpsellModel` as empty suggestions without retry.
- [x] 13.4 Add `.github/workflows/ios.yaml` running build and tests. Evidence: `.github/workflows/ios.yaml` runs `swift test` (SP and IndooroKit), a Simulator build, an unsigned Release build for `generic/platform=iOS` with `-skipPackagePluginValidation`, and the app unit and UI tests against the mock. Not executed on GitHub yet.
- [ ] 13.5 Set `maven.compiler.release=21` in `backend/indooro_server/pom.xml` and change `.github/workflows/ci.yaml` to JDK 21 (one Java version for compile, CI, and runtime per `docs/audit/MODERNIZATION_BLUEPRINT.md` BP-ADR-02) and `mvn -B verify` with tests. (zurückgestellt: betrifft das Deploy-Image und damit den Deploy; nicht ohne Freigabe von Hand.)

## 14. Legacy Retirement

- [ ] 14.1 Delete `swift/indooro-` and `swift/indooroApp` after confirming no unique behavior remains (compare against `docs/specs/AUDIT.md` §1.3).
- [x] 14.2 Delete the untracked `swift/indooro-EinkaeuferFinal.zip`. (Done 2026-09-21, moved to the macOS Trash.)
- [x] 14.3 Update `openspec/config.yaml`, `README.md`, and `docs/specs/TSD.md` to the new structure. (Stand der Struktur mit IndooroKit (IndooroModels, IndooroNetworking), IndooroNavigationCore, Config und Test-Einstiegen eingetragen; Ziel-Targets, die noch fehlen, sind als offen markiert und werden mit 5.x/8.x/9.x nachgezogen.)

## 15. Verification

- [x] 15.1 Run `npx -y @fission-ai/openspec@1.3.1 validate modernize-ios-client-architecture --strict`. Evidence (2026-10-18, `pilot/first-store`): validate --all --strict 55/55 (this change passes; it stays open for the deferred tasks).
- [ ] 15.2 Run `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme 'MCindooroApp (LeoCloud)' -destination 'platform=iOS Simulator,name=iPhone 16' -skipPackagePluginValidation test`. (Konkretes Simulator-Ziel verwenden: `generic/platform=iOS Simulator` mit `-sdk iphonesimulator` bricht im Build-Tool-Plugin swift-openapi-generator ab, siehe SP/TESTING.md.)
- [x] 15.3 Run `./mvnw verify` in `backend/indooro_server`. Evidence (2026-10-18, `pilot/first-store` 5bfd7f0+): `sh mvnw -q verify` exit 0; `mvnw test` 671/0 (4 skipped).
- [ ] 15.4 Repeat the manual smoke checklist from task 1.3 against LeoCloud and on a device with beacons.
- [ ] 15.5 Compare metrics with the baseline from task 1.2 and record them in `docs/specs/TSD.md`.
