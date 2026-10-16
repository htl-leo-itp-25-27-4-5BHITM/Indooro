# Pilot-Status

Jede Person aktualisiert nur ihre eigene Zeile und ihre eigenen Blocker. Datum JJJJ-MM-TT.

## Stand je Person

| Person | Aktuelle Change | Branch | Erledigte Tasks | Nächste Tasks | Prüfungen zuletzt | Aktualisiert |
|---|---|---|---|---|---|---|
| Erik (Mac) | `add-pilot-guided-tour-fallbacks` | `pilot/erik-guided-tour` | 1.x, 2.x, 3.x, 4.x, 5.x, 6.x, 9.x, 10.x, 8.1/8.2 (PR offen) | 8.3 nach Merge; Geräte-Check 13.6 | `swift test` 118/118, xcodebuild ok, openspec validate 64/0 (2026-10-16) | 2026-10-16 |
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
| QR-Anker: gedruckten Code mit der Kamera am iPhone scannen (Gerät, `add-qr-anchor-positioning` 3.5); Kamera-Text in den Build-Settings ergänzen („… und zum Scannen von QR-Codes …“, Person A) | Erik / Person A | 2026-10-16 |
| `add-ios-pilot-ui-tests` (F) wartet auf Merge von `prepare-pilot-ios-build`, `add-ios-app-test-target`, `add-pilot-guided-tour-fallbacks`; danach UI-Test-Target `MCindooroAppUITests` in Xcode anlegen (Human step 1.2) | Erik | 2026-10-16 |
| `improve-positioning-with-motion` (G) wartet auf ≥ 5 echte Aufnahmen mit Truth-Markern aus zwei Orten (Person C) | Person C / Erik | 2026-10-16 |

## Hinweise an Personen

| Datum | Von | An | Hinweis |
|---|---|---|---|
| 2026-10-16 | Erik | Person A | Studienmodus-Zähler stehen bereit (`add-pilot-guided-tour-fallbacks` 10.1): `NavigationSession.routeBuildCount`, `rerouteCount`, `stopChangeWithoutEventCount`, `manualPositionCount` (`@Published`, nur lesen). Branch `pilot/erik-guided-tour`, nach Merge in `pilot/first-store` verfügbar. |
| 2026-10-16 | Erik | Person A | Kategorie-Codes stehen in deinen Dateien noch in Kundenansichten: `Views/Main/ProductSearchRow.swift` („Regal <layoutCode>“) und `ShoppingTransferViews.swift` (Zeilen ~89, ~223 „Regal: <layoutCode>“). Ersatz: `ShelfLocationDescriptor.make(layoutCode:shelves:)?.primary` (verfügbar mit Merge von `pilot/erik-guided-tour`), Fallback `ShelfLocationDescriptor.notInTestAreaText`. |

## Blocker

| Datum | Person | Blocker / Frage | Antwort |
|---|---|---|---|
| – | – | – | – |

## Entscheidungen

| Datum | Entscheidung | Wer |
|---|---|---|
| 2026-10-16 | Feature-Freeze für den Pilot; nur Tasks aus den Pilot-Changes (`ROADMAP.md`) | Team (vorgeschlagen) |
| 2026-10-16 | Admin-Neubau per „Pilot-Cut“ abgeschlossen und ausgerollt; Phase B von Person B und Abschnitt 7 von Erik sind freigegeben | Erik |
