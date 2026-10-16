# Roadmap: Alle Changes bis „Indooro funktioniert im echten Markt“

Stand: 16.10.2026

## 1. Was heißt „das Produkt funktioniert“?

Für dieses Projekt gilt Indooro als funktionierend, wenn **Phase 3 des Pilots** (Praxistest mit 15–30 Testpersonen in einem echten Markt) die Akzeptanzkriterien aus `docs/pilot-readiness/03_PILOT_READINESS.md` Abschnitt 6.3 erfüllt oder ehrlich begründet verfehlt – mit Daten. Alles, was dafür nötig ist, steht unten als OpenSpec-Change. Alles andere ist „nach dem Pilot“.

## 2. Kurz erklärt: Wo stehen wir?

- **Navigation stabilisiert?** Ja, im Code: Branch `codex/stabilize-ios-navigation` (14 Commits vom 15.10.). Ziele flattern nicht mehr, Routen sind stabil, 77 automatische Tests grün, im Simulator geprüft. **Nicht** geprüft: echtes iPhone mit echten Beacons. Dieser Stand ist jetzt der Kern von `pilot/first-store`. Auf `main` ist er noch nicht.
- **Was ist ein Worktree?** Nur ein zweiter Ordner auf der Festplatte, in dem ein anderer Branch ausgecheckt ist. Beispiel: `Indooro/` hat den Werbefilm-Branch, `Indooro-pilot/` den Pilot-Branch, `~/.codex/worktrees/admin-rebuild/Indooro` den Admin-Branch. Alle teilen dasselbe Git-Repository. So können mehrere Agenten gleichzeitig an verschiedenen Branches arbeiten, ohne sich Dateien zu überschreiben. Mit dem Inhalt hat das nichts zu tun.
- **Muss die Admin-Plattform fertig sein, bevor wir anfangen?** Nein. iOS, Messungen, Datenwerkzeuge, Pilot-Kit, Beacon-Planer, Auswertung und die Infrastruktur-Teile können **sofort** starten. Nur drei Dinge warten auf den Admin-Merge in `main`: Backend-Härtung im Java-Code, die Pilot-Bereitschaftsseite im Admin und das Deployment des neuen Admins auf LeoCloud.
- **Ist die Admin-Plattform schon brauchbar?** Ja, funktional: 9 von 10 Routen sind im neuen Admin umgeschaltet, der neue Layout-Editor existiert zusätzlich zum alten, 142 Backend-Tests waren grün. Der Admin-Agent sammelt seit Tagen vor allem **Nachweise** (Paritätsmatrizen, Screenshots, Rollback-Belege). Für den Pilot reicht der heutige Stand. Empfehlung: Admin-Agent mit dem „Pilot-Cut“-Prompt (`PROMPT_ADMIN_AGENT.md`) abschließen lassen, pushen und in `main` mergen – Ziel: **diese Woche**.

## 3. Alle Changes

### Bereits vorhanden und für den Pilot relevant

| Change | Stand | Was davon für den Pilot | Wer |
|---|---|---|---|
| `stabilize-ios-navigation-pipeline` | 83/93 | Rest = Feldaufgaben 10.4, 12.x, 13.6 | Erik + Person C (über `establish-pilot-field-measurement`) |
| `rebuild-admin-platform` (nur auf Admin-Branch) | 34/39 | Pilot-Cut, Merge in `main` | Erik (Admin-Agent) |
| `fix-ios-contract-and-spec-drift` | 1/43 | 1.3, 2, 3–8, 9, 10 | verteilt: A (3–6, 10), Erik (7–9, 1.3 über Testtarget), B (2) |
| `protect-legacy-write-endpoints` | 0/23 | komplett | Person B (nach Admin-Merge) |
| `harden-platform-security-baseline` | 0/40 (8 auf Admin-Branch) | 1.1, 1.2, 4.2, 4.3, 5.1, 5.2, 5.5, 8.2 | Person B |

### Neu angelegt (Pilot)

| # | Change | Inhalt | Wer | Rechner | Branch | Startet |
|---|---|---|---|---|---|---|
| 1 | `add-pilot-guided-tour-fallbacks` | Route ohne Ortung, „Ich bin hier“, Regal in Worten, Offline-Cache, gedrehte Regale, Zähler für Studienmodus, Integration Admin | Erik | Mac | `pilot/erik-guided-tour` | sofort |
| 2 | `prepare-pilot-ios-build` | Suche, Pilot-Profil, Berechtigungen, deutsche Texte, Icon, Installation | Person A | Mac | `pilot/ios-pilot-build` | sofort |
| 3 | `add-ios-app-test-target` | XCTest-Target, Fixtures, CI für Swift-Tests | Erik | Mac | `pilot/ios-test-target` | Woche 2 |
| 4 | `add-pilot-study-mode` | Testleitungs-Modus: Zeiten, Ergebnis, Zähler, Export | Person A | Mac | `pilot/ios-study-mode` | nach 2 |
| 5 | `release-pilot-backend` | OpenSearch zu, Secrets raus, Backup/Restore, Smoke-Check, CI mit Tests, Release-Runbook; Phase B: Härtung + erster Pilot-Release | Person B | Windows | `pilot/release-backend` | Phase A sofort, Phase B nach Admin-Merge |
| 6 | `add-store-pilot-readiness-check` | Seite „Pilot-Bereitschaft“: Layout × Produkte × Beacons | Erik | Mac | `pilot/store-readiness` (später von `main`) | nach Admin-Merge |
| 7 | `establish-pilot-field-measurement` | Beacon-Standard, Hardware, Messprotokoll, Aufnahmen, Analyse, Kalibrierung | Person C [C] + Erik [E] | Windows + Mac | `pilot/field-measurement` + `pilot/field-replay` | sofort |
| 8 | `add-beacon-placement-planner` | Python-Tool: wie viele Beacons wohin | Person C | Windows | `pilot/beacon-planner` | sofort |
| 9 | `prepare-pilot-store-operations` | Konventionen, CSV-Import, Pilot-Kit, Checklisten | Person C | Windows | `pilot/store-operations` | sofort |
| 10 | `prepare-pilot-evaluation` | Python-Auswertung gegen Akzeptanzkriterien | Person C | Windows | `pilot/pilot-evaluation` | nach 9 (Fragebogen) |

### Abhängigkeiten

```
Admin-Pilot-Cut ──► Merge in main ──► release-pilot-backend Phase B ──► erster Pilot-Release (LeoCloud)
                                  ├──► add-store-pilot-readiness-check
                                  └──► Erik: main → pilot/first-store (Abschnitt 7 von #1)

prepare-pilot-ios-build ──► add-pilot-study-mode ──► (Exportformat) ──► prepare-pilot-evaluation
add-pilot-guided-tour-fallbacks §10 (Zähler) ──► add-pilot-study-mode
add-beacon-placement-planner ──► establish-pilot-field-measurement §5.3, §7.1
prepare-pilot-store-operations §4.4 (Fragebogen) ──► prepare-pilot-evaluation
establish-pilot-field-measurement ──► Entscheidung Pilotmodus A/C/B
alles ──► Pilot Phase 2 (Markt, technisch) ──► Phase 3 (Testpersonen) ──► Auswertung ──► Archivierung
```

## 4. Bewusst NICHT vor dem Pilot (nach dem Pilot neu bewerten)

| Change / Thema | Grund |
|---|---|
| `modernize-ios-client-architecture` (62 offen) | Architektur ohne Nutzerwirkung im Pilot, hohes Konfliktrisiko |
| `stabilize-upsell-quality-and-request-lifecycle` (135 offen) | Upsell ist im Pilot aus |
| `optimize-backend-data-access`, `establish-shared-api-contract`, `fix-admin-dashboard-contract-drift` (Rest) | nicht pilotkritisch |
| Rest von `harden-platform-security-baseline` | nach dem Pilot |
| AR-Navigation, Android, Werbefilm V2, Rezepte-Ausbau | STOP-Liste |
| CSV-Import im Admin-UI, Bestandsdaten, Produktbilder, mehrere Märkte | nach dem Pilot |

## 5. Zeitplan

| Woche | Erik (Mac) | Person A (Mac) | Person B (Windows) | Person C (Windows) |
|---|---|---|---|---|
| 1 (19.–23.10.) | Admin-Pilot-Cut + Merge; #1 Abschn. 2–3 | #2 Abschn. 1–4 | #5 Phase A Abschn. 1–3 | #9 Abschn. 1–3; #7 Abschn. 2 |
| 2 (26.–30.10.) | #1 Abschn. 4–6; Admin → pilot (Abschn. 7) | #2 Abschn. 5–7 | #5 Abschn. 4; Phase B 5.x | #8 komplett; #7 Abschn. 3–4 |
| 3 (02.–06.11.) | #1 Abschn. 9–10; #7 [E] 1.2, 3.3, 4.3, 4.6 | #3 | #6 Readiness-Check | #9 Abschn. 4–5; #7 Testraum-Messung |
| 4 (09.–13.11.) | #7 [E] 5.2, 6.1; erster Pilot-Release (mit B) | #4 Studienmodus | #5 Abschn. 6 mit Erik; #6 fertig | #10 Auswertung; #7 großer Raum |
| 5–8 | Markttermin, Kalibrierung | Fixes, Leihgeräte | Betrieb, Backups vor jedem Termin | Datenerfassung Markt, Sitzungen, Auswertung |

Gate „bereit für den Markt“ (Ende Woche 4): #1, #2, #5 Phase A, #9 gemergt; erste echte Messdaten aus #7; neuer Admin live.
