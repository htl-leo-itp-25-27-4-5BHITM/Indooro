# Pilot-Status

Jede Person aktualisiert nur ihre eigene Zeile und ihre eigenen Blocker. Datum JJJJ-MM-TT.

## Stand je Person

| Person | Aktuelle Change | Branch | Erledigte Tasks | Nächste Tasks | Prüfungen zuletzt | Aktualisiert |
|---|---|---|---|---|---|---|
| Erik (Mac) | `add-ios-app-test-target` | `pilot/ios-test-target` | 1.x, 2.x, 3.1, 3.2, 3.6, 4.1, 4.3 | 3.3–3.5 (warten auf Person A / Studienmodus) | `swift test` 88/88, `xcodebuild test` 11/11, Debug/Release ok (2026-10-16) | 2026-10-16 |
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
| 2026-10-16 | Erik (Tests `add-ios-app-test-target`) | Person A | Defekte aus den Fixture-Tests (Tests halten das Ist-Verhalten fest, bitte in deinen Dateien beheben und den Test anpassen): (1) `MobileStoreSummary` mappt das Feld `address` aus `GET /api/mobile/stores` nicht, `displaySubtitle` zeigt nur die Stadt (`Models/MobileStoreModels.swift`). (2) `ProductSearchStore.handleProductsResponse` dekodiert die Liste nicht lossy: ein defektes Element leert die ganze Trefferliste ohne Hinweis. (3) `ProductSearchStore.searchProducts` nutzt `.urlQueryAllowed`; `&`, `+`, `#` im Suchbegriff werden nicht kodiert (deckt sich mit `prepare-pilot-ios-build` 4.1). |

## Hinweise an Personen

| Datum | Von | An | Hinweis |
|---|---|---|---|
| 2026-10-16 | Erik | Person A | `project.pbxproj` ist in `pilot/ios-test-target` (PR #114) erweitert: neues Target `MCindooroAppTests` plus geteiltes Scheme `MCindooroApp`. Bitte #114 vor deinem PR mit pbxproj-Änderungen mergen, danach `origin/pilot/first-store` einmergen. `ShoppingListManager.init(defaults:)` ist neu (Default `.standard`). Skript: `scripts/ios/add_unit_test_target.rb`. |

## Blocker

| Datum | Person | Blocker / Frage | Antwort |
|---|---|---|---|
| – | – | – | – |

## Entscheidungen

| Datum | Entscheidung | Wer |
|---|---|---|
| 2026-10-16 | Feature-Freeze für den Pilot; nur Tasks aus den Pilot-Changes (`ROADMAP.md`) | Team (vorgeschlagen) |
| 2026-10-16 | Admin-Neubau per „Pilot-Cut“ abgeschlossen und ausgerollt; Phase B von Person B und Abschnitt 7 von Erik sind freigegeben | Erik |
