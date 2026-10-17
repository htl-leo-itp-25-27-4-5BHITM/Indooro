# Pilot-Status

Jede Person aktualisiert nur ihre eigene Zeile und ihre eigenen Blocker. Datum JJJJ-MM-TT.

## Stand je Person

| Person | Aktuelle Change | Branch | Erledigte Tasks | Nächste Tasks | Prüfungen zuletzt | Aktualisiert |
|---|---|---|---|---|---|---|
| Erik (Mac) | `add-pilot-guided-tour-fallbacks` (PR #113 gemergt; Change bleibt offen bis Geräte-Check 13.6), `add-ios-app-test-target` (PR #114 gemergt) | `pilot/erik-guided-tour`, `pilot/ios-test-target` | Tour: 1.x–6.x, 8.x, 9.x, 10.x; Tests: 1.x, 2.x, 3.1, 3.2, 3.6, 4.x, 5.x; `stabilize-ios-navigation-pipeline` 10.4 (Renderzählung, Evidenz `evidence/render-probe/`) | Tests 3.3–3.5 (warten auf Person A / Studienmodus); Geräte-Check 13.6 | `swift test` 170 (1 übersprungen), `xcodebuild test` Unit 11/11 (2026-10-17) | 2026-10-17 |
| Erik (Mac) | `add-qr-anchor-positioning` (PR #117 gemergt) | `pilot/qr-anchors` | 1.x–3.x, 5.x; Gerätetest iPhone 13 mit Mock bestanden | 4.4 (wartet auf `STORE_DATA_ENTRY.md`, Person C); gedruckter Code gegen echten Markt (nach Backend-Rollout) | `swift test` 157, Backend 146/0, admin-ui 81/81 + Browser 115 (2026-10-16) | 2026-10-17 |
| Erik (Mac) | `add-ios-pilot-ui-tests` (F, PR #118 offen) | `pilot/ios-ui-tests` | 1.x, 2.x, 3.2–3.4, 4.x; CI grün (iOS 26.5, 8 UI-Tests) | 3.1 (wartet auf `prepare-pilot-ios-build`), 3.5 (wartet auf `add-pilot-study-mode`); Merge von #118 vor Person As pbxproj-PR | `scripts/ios/run-ui-tests.sh` 8 UI + 11 Unit grün, `swift test` 170 (2026-10-17) | 2026-10-17 |
| Erik (Mac, Feldmessung) | `establish-pilot-field-measurement` [E] | `pilot/field-replay` | 1.2, 4.3, 6.1 | 3.3, 5.2 (warten auf Messung Person C), 4.6, 6.4 (Mensch) | `swift test` 79/79 (1 skipped), xcodebuild ok (2026-10-16) | 2026-10-16 |
| Erik (Mac) | `add-store-pilot-readiness-check` (PR #116 gemergt) | `pilot/store-readiness` | 1.x–4.4, 5.x | Entscheidung Abdeckungsregel | Backend 182/0, admin-ui 81/81 + Browser 115/115 (2026-10-16) | 2026-10-17 |
| Person A (Mac) | `prepare-pilot-ios-build` | `pilot/ios-pilot-build` | – | 1.1–3.5 | – | 2026-10-16 |
| Person B (Windows) | `release-pilot-backend` Phase A | `pilot/release-backend` | – | 1.1–3.5 | – | 2026-10-16 |
| Person C (Windows) | `prepare-pilot-store-operations` | `pilot/store-operations` | – | 1.1–3.5 | – | 2026-10-16 |
| Admin-Agent | Welle 2: `complete-admin-parity-evidence`, `add-editor-floorplan-underlay` | `pilot/admin-parity`, `pilot/editor-underlay` | Pilot-Cut erledigt, live | laut `PROMPT_ADMIN_AGENT_WAVE2.md` | Backend 142/0 (2026-10-16) | 2026-10-16 |

## Meilensteine

| Meilenstein | Status |
|---|---|
| Admin-Neubau in `main` gemergt | **erledigt 2026-10-16** (PR #105, `39b5f9a`; Fix PR #107) |
| `main` in `pilot/first-store` gemergt | **erledigt 2026-10-16** (`f6cdf17`; swift test 77/77, xcodebuild ok, mvnw test 142/0) |
| Erster Pilot-Release auf LeoCloud (neuer Admin, gehärtet) | neuer Admin **live seit 2026-10-16** inkl. Admin-Frontend (Image `:d91a1b0`, Doku PR #106, CI-Fix PR #108); Härtung (Person B, Phase B) offen |
| Erste echte Messung (Testraum) | offen |
| Gate „bereit für den Markt“ | offen |
| Pilotmarkt zugesagt | offen |

## Wartet auf Menschen

| Was | Wer | Seit |
|---|---|---|
| Namenszuordnung Person A/B/C festlegen, Prompts verschicken | Erik | 2026-10-16 |
| Admin-Login live prüfen (admin, region-manager, store-manager; Login/Logout) | Erik | 2026-10-16 |
| Budget und Bestellung von 12 Beacons | Erik + Person C | 2026-10-16 |
| Herkunft „SPAR Posttraße“-Layout und Belegplan klären | Erik | 2026-10-16 |
| Termin mit Betreuung | Erik | 2026-10-16 |
| **Nur physisch:** gedruckten QR-Code (Seite „QR-Codes drucken“ im Admin) in einem echten Markt mit angelegten Ankern scannen (`add-qr-anchor-positioning` 3.5, Rest). Der Kamera-Scan mit dem Mock-Store ist am iPhone 13 bestanden (Ein-Scan über Store-Grenzen eingeschlossen). Voraussetzung: Backend-Rollout mit Anker-Validierung und Layout mit Ankern im Markt; Kamera-Text in den Build-Settings ergänzt Person A („… und zum Scannen von QR-Codes …“) | Erik / Person A | 2026-10-16 |
| PR #118 (`add-ios-pilot-ui-tests`) ist gemergt (2026-10-17). Person A: vor deinem PR `origin/pilot/first-store` einmergen (`project.pbxproj` enthält jetzt `MCindooroAppTests` und `MCindooroAppUITests`). Offen in F: 3.1 (nach `prepare-pilot-ios-build`) und 3.5 (nach `add-pilot-study-mode`) | Erik / Person A | 2026-10-17 |
| `improve-positioning-with-motion` (G) wartet auf ≥ 5 echte Aufnahmen mit Truth-Markern aus zwei Orten (Person C) | Person C / Erik | 2026-10-16 |
| **Nur physisch:** Mess-iPhones anstecken, entsperren, „Vertrauen“ tippen, `scripts/ios/install-debug-on-device.sh` starten, Geräte in `docs/pilot-readiness/team/DEVICES.md` eintragen (`establish-pilot-field-measurement` 4.6); `Self._printChanges()` am Gerät messen (6.4) | Erik | 2026-10-16 |
| Aufnahmen (≥ 3 Testraum, ≥ 2 großer Raum) nach `NavigationFixtures/incoming/` legen; sie lösen 3.3, 5.2, 5.4, 6.3 aus | Person C | 2026-10-16 |
| Entscheidung Abdeckungsregel (`add-store-pilot-readiness-check`) (Radius 8 m / 5 % / ≥ 3 Beacons ist auf einem leeren 20×20-m-Raum selbst mit 9 Beacons gelb) | Erik | 2026-10-16 |

## Hinweise an Personen

| Datum | Von | An | Hinweis |
|---|---|---|---|
| 2026-10-16 | Erik | Person A | `project.pbxproj` ist in `pilot/ios-test-target` (PR #114) erweitert: neues Target `MCindooroAppTests` plus geteiltes Scheme `MCindooroApp`. Bitte #114 vor deinem PR mit pbxproj-Änderungen mergen, danach `origin/pilot/first-store` einmergen. `ShoppingListManager.init(defaults:)` ist neu (Default `.standard`). Skript: `scripts/ios/add_unit_test_target.rb`. |
| 2026-10-16 | Erik | Person A | Defekte aus den Fixture-Tests (Tests halten das Ist-Verhalten fest, bitte in deinen Dateien beheben und den Test anpassen): (1) `MobileStoreSummary` mappt das Feld `address` aus `GET /api/mobile/stores` nicht, `displaySubtitle` zeigt nur die Stadt (`Models/MobileStoreModels.swift`). (2) `ProductSearchStore.handleProductsResponse` dekodiert die Liste nicht lossy: ein defektes Element leert die ganze Trefferliste ohne Hinweis. (3) `ProductSearchStore.searchProducts` nutzt `.urlQueryAllowed`; `&`, `+`, `#` im Suchbegriff werden nicht kodiert (deckt sich mit `prepare-pilot-ios-build` 4.1). |
| 2026-10-16 | Erik | Person A | Studienmodus-Zähler stehen bereit (`add-pilot-guided-tour-fallbacks` 10.1): `NavigationSession.routeBuildCount`, `rerouteCount`, `stopChangeWithoutEventCount`, `manualPositionCount` (`@Published`, nur lesen). Branch `pilot/erik-guided-tour`, nach Merge in `pilot/first-store` verfügbar. |
| 2026-10-16 | Erik | Person A | Kategorie-Codes stehen in deinen Dateien noch in Kundenansichten: `Views/Main/ProductSearchRow.swift` („Regal <layoutCode>“) und `ShoppingTransferViews.swift` (Zeilen ~89, ~223 „Regal: <layoutCode>“). Ersatz: `ShelfLocationDescriptor.make(layoutCode:shelves:)?.primary` (verfügbar mit Merge von `pilot/erik-guided-tour`), Fallback `ShelfLocationDescriptor.notInTestAreaText`. |
| 2026-10-17 | Erik | Person A | PR `pilot/ios-ui-tests` ändert `project.pbxproj` (neues Target `MCindooroAppUITests`, Scheme `MCindooroApp`). Bitte vor deinem PR mit pbxproj-Änderungen mergen und danach `origin/pilot/first-store` einmergen. Der Test-Hook `-uiTesting` liegt DEBUG-only in `BeaconManager` (Modus „Ohne Ortung“, keine Standort-Abfrage). Sobald `AppEnvironment` gemergt ist, kann der Fixture-Modus dorthin wandern. Die UI-Tests finden Elemente über sichtbare Labels (Tabs „Planung“/„Karte“/„Einkaufen“, Suchfeld „Was möchtest du kaufen?“, „Einplanen“, „Tour starten“): Label-Änderungen in deinen Dateien bitte mit `sh scripts/ios/run-ui-tests.sh` prüfen. |

## Blocker

| Datum | Person | Blocker / Frage | Antwort |
|---|---|---|---|
| – | – | – | – |

## Entscheidungen

| Datum | Entscheidung | Wer |
|---|---|---|
| 2026-10-16 | Feature-Freeze für den Pilot; nur Tasks aus den Pilot-Changes (`ROADMAP.md`) | Team (vorgeschlagen) |
| 2026-10-16 | Admin-Neubau per „Pilot-Cut“ abgeschlossen und ausgerollt; Phase B von Person B und Abschnitt 7 von Erik sind freigegeben | Erik |
