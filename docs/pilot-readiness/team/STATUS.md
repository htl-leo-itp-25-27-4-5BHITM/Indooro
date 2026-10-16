# Pilot-Status

Jede Person aktualisiert nur ihre eigene Zeile und ihre eigenen Blocker. Datum JJJJ-MM-TT.

## Stand je Person

| Person | Aktuelle Change | Branch | Erledigte Tasks | Nächste Tasks | Prüfungen zuletzt | Aktualisiert |
|---|---|---|---|---|---|---|
| Erik (Mac) | `add-pilot-guided-tour-fallbacks` | `pilot/erik-guided-tour` | 7.1–7.4 | 1.1–2.7 | `swift test` 77/77 (2026-10-15) | 2026-10-16 |
| Person A (Mac) | A + B reviewbar; C/D Gates | `pilot/ios-study-mode` | A 24/35, B 16/17; PR-Texte + Evidence vorhanden | Erik-Integration/Freigaben, C Kit-Übernahme; C wartet auf A-Merge; D Messdaten | 91 Tests/0; Build grün; B UI 2/0; OpenSpec 64/0 | 2026-10-16 |
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
| Pilot-iPhones: Modell + iOS-Version nennen, anschließend Installation und Bluetooth-Aus prüfen (A 1.3/6.4/7.3); David kennt Geräte derzeit nicht | Person A / Team | 2026-10-16 |

## Blocker

| Datum | Person | Blocker / Frage | Antwort |
|---|---|---|---|
| 2026-10-16 | Person A | A 4.2/5.1/5.2/5.6: Erik muss BeaconManager-Layoutdecoder (Alt 3.2), StoreMapPage-Filialübersicht ohne erfundene Koordinaten (Alt 6.x), Release-Debug-/Layout-Steuerungen und Kartentexte freigeben oder selbst integrieren. SearchOverlayView bleibt bis zur Löschfreigabe erhalten. | offen |
| 2026-10-16 | Person A | A 5.4: PermissionBanner und Suchfehler über ContentView integriert; StoreMapPage unverändert. | gelöst ohne Änderung an Eriks Datei |
| 2026-10-16 | Person A | A 6.5: explizite Freigabe von Erik zum Entfernen der vier toten Views fehlt. | offen |
| 2026-10-16 | Person A | D 1.1: docs/pilot-readiness/hardware/RESULT_SUMMARY.md auch nach finalem Fetch nicht vorhanden; gemäß Auftrag übersprungen („wartet auf Messergebnis“). Keine Schwellen ohne Messdaten. | offen |
| 2026-10-16 | Person A | B: Erik muss routeBuildCount, rerouteCount, stopChangeWithoutEventCount und manualPositionCount an NavigationSession monoton sowie manualPosition/reroute/stopChange-Ereignisse veröffentlichen. Bis dahin Zeit/Ergebnis, fehlende Navigationswerte „-“. | offen |
| 2026-10-16 | Person A | B 4.1: kit/study-export-sample gehört Person C. Person C: fertiger synthetischer Export (3 Zeilen, 6 Events) liegt unter evidence/add-pilot-study-mode/study-export-sample auf pilot/ios-study-mode; bitte CSV + JSONL in den Kit-Pfad übernehmen. Simulator/Formatprüfung erledigt. | offen |
| 2026-10-16 | Person A | C: Start-Gate „A in pilot/first-store gemergt“ weiterhin nicht erfüllt (a20d385 nicht in 46b9ad1). Auf pilot/ios-accessibility a62877f: Baseline 77/0, Build grün, OpenSpec 64/0; Audit/Umsetzung nicht begonnen, Gate-Doku gepusht. MapView/StoreMapPage-Modifier zusätzlich pro Datei mit Erik absprechen. | offen |

## Entscheidungen

| Datum | Entscheidung | Wer |
|---|---|---|
| 2026-10-16 | Feature-Freeze für den Pilot; nur Tasks aus den Pilot-Changes (`ROADMAP.md`) | Team (vorgeschlagen) |
| 2026-10-16 | Admin-Neubau per „Pilot-Cut“ abgeschlossen und ausgerollt; Phase B von Person B und Abschnitt 7 von Erik sind freigegeben | Erik |
