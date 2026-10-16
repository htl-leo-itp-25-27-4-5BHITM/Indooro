# Roadmap: Alle Programmieraufgaben bis „Indooro funktioniert im echten Markt“

Stand: 16.10.2026 · Indooro ist ein HTL-Schulprojekt (keine Diplomarbeit).

## 1. Ziel

Indooro funktioniert, wenn ein Kunde in einem echten Markt ein Produkt sucht, verständlich sieht, wo es steht, und dorthin geführt wird. Das muss mit iPhone-App **und** im Browser (Android) gehen. Die Ortung ist dabei Zusatz, kein Muss. Der Markt kann seine Daten selbst pflegen. Gemessen wird das mit Phase 3 des Pilots, Kriterien siehe `docs/pilot-readiness/03_PILOT_READINESS.md` 6.3.

## 2. Stand heute in drei Sätzen

- **Navigation:** stabilisiert, 77 Tests grün, im Simulator geprüft (Branch `pilot/first-store`). Mit echten Beacons noch nie gemessen.
- **Admin-Neubau:** fertig für den Pilot. PR #105 wartet auf Backup, Merge und Rollout. Der Legacy-Editor bleibt aktiv.
- **Worktree:** nur ein zusätzlicher Ordner für einen anderen Branch. So arbeiten mehrere Agenten parallel, ohne sich Dateien zu überschreiben.

## 3. Alle Changes

Kapazität: Erik hat am meisten (Claude, ~150 % Wochenlimit), A, B und C je eine Codex-Instanz. Die Reihenfolge pro Person ist verbindlich. Welle 2 beginnt, sobald Welle 1 der Person erledigt oder blockiert ist.

### Welle 1 – Pilot-Minimum (Sprint 1–2)

| # | Change | Nutzen | Wer | Rechner | Branch | Start |
|---|---|---|---|---|---|---|
| 1 | `add-pilot-guided-tour-fallbacks` | Route ohne Ortung, „Ich bin hier“, Regal in Worten, Offline, gedrehte Regale, Zähler | Erik | Mac | `pilot/erik-guided-tour` | sofort |
| 2 | `prepare-pilot-ios-build` | Suche, Pilot-Profil, Berechtigungen, Texte, Icon | A | Mac | `pilot/ios-pilot-build` | sofort |
| 3 | `add-ios-app-test-target` | App-Tests + Swift-CI | Erik | Mac | `pilot/ios-test-target` | Woche 2 |
| 4 | `add-pilot-study-mode` | Testleitungs-Modus mit Export | A | Mac | `pilot/ios-study-mode` | nach 2 |
| 5 | `release-pilot-backend` | Server geschützt, Backup, CI, Release; Phase B Härtung | B | Windows | `pilot/release-backend` | A sofort, B nach Admin-Merge |
| 6 | `add-store-pilot-readiness-check` | Seite „Pilot-Bereitschaft“ | Erik | Mac | `pilot/store-readiness` | nach Admin-Merge |
| 7 | `establish-pilot-field-measurement` | Beacon-Standard, echte Messungen, Kalibrierung | C [C] + Erik [E] | Win + Mac | `pilot/field-measurement`, `pilot/field-replay` | sofort |
| 8 | `add-beacon-placement-planner` | wie viele Beacons wohin | C | Windows | `pilot/beacon-planner` | sofort |
| 9 | `prepare-pilot-store-operations` | Konventionen, CSV-Werkzeug, Pilot-Kit | C | Windows | `pilot/store-operations` | sofort |
| 10 | `prepare-pilot-evaluation` | Auswertung gegen Kriterien | C (oder B, wenn B frei) | Windows | `pilot/pilot-evaluation` | nach 9 |

### Welle 2 – Produkt wirklich brauchbar machen (Sprint 2–4)

| # | Change | Nutzen | Wer | Rechner | Branch | Voraussetzung |
|---|---|---|---|---|---|---|
| 11 | `complete-admin-parity-evidence` (auf `main` nach Merge) | neuer Editor wird Standard | Erik (Admin-Agent) | Mac | eigener Branch von `main` | Admin-Merge |
| 12 | `add-qr-anchor-positioning` | QR-Codes an Gangenden setzen die Position exakt; gleiche Codes öffnen den Web-Finder | Erik | Mac | `pilot/qr-anchors` | `main` in Pilot gemergt |
| 13 | `add-editor-floorplan-underlay` | Grundriss-Foto/Plan als Vorlage im Editor, Markt in Minuten nachzeichnen | Erik (Admin-Agent) | Mac | `pilot/editor-underlay` | Admin-Merge |
| 14 | `add-ios-pilot-ui-tests` | Pilotabläufe automatisch in CI geprüft | Erik | Mac | `pilot/ios-ui-tests` | 1, 2, 3 gemergt |
| 15 | `improve-positioning-with-motion` | Schrittzähler/Kompass: ruhigerer Punkt, weniger Nachlauf | Erik | Mac | `pilot/motion-positioning` | ≥ 5 echte Aufnahmen |
| 16 | `add-store-scoped-catalog` | Produkte gehören zu einem Markt (heute alle `storeId: null`) | B | Windows | `pilot/store-catalog` | Admin-Merge |
| 17 | `improve-product-search-quality` | deutsche Wortteile, Umlaute, „Paradeiser“, Tippen-während-Suchen, gemessene Qualität | B | Windows | `pilot/search-quality` | Admin-Merge |
| 18 | `add-admin-catalog-spreadsheet-import` | Markt importiert Excel selbst, mit Prüfung | B | Windows | `pilot/catalog-import` | 16 |
| 19 | `upgrade-customer-web-product-finder` | Web-Finder für Android/alle, per QR am Eingang | C | Windows | `pilot/web-finder` | Admin-Merge |
| 20 | `add-editor-beacon-coverage-overlay` | Abdeckung live im Editor | C | Windows | `pilot/editor-coverage` | 8 + Admin-Merge |
| 21 | `improve-ios-accessibility` | große Schrift, VoiceOver, Kontrast | A | Mac | `pilot/ios-accessibility` | 2 |
| 22 | `add-arrival-suggestion` | „Bist du bei Regal X?“ statt immer tippen | A | Mac | `pilot/arrival-suggestion` | Messergebnis aus 7 |

Archiv-Reihenfolge später: 8 vor 20 (neue Capability `beacon-placement-planning`), 16 vor 18.

### Übernommene Teile älterer Changes

| Change | Teile | Wer |
|---|---|---|
| `stabilize-ios-navigation-pipeline` | 10.4, 12.x, 13.6 | Erik + C (über 7) |
| `fix-ios-contract-and-spec-drift` | 3–6, 10 (A); 1.3, 7–9 (Erik); 2 (B) | verteilt |
| `protect-legacy-write-endpoints` | komplett | B (über 5) |
| `harden-platform-security-baseline` | 1.1, 1.2, 4.2, 4.3, 5.1, 5.2, 5.5, 8.2 | B (über 5) |

## 4. Aufwand pro Person

| Person | Welle 1 (Tasks) | Welle 2 (Tasks, meist größer) | Summe |
|---|---|---|---|
| **Erik** | ~90 | 11 (7) + 12 (17) + 13 (12) + 14 (12) + 15 (10) = ~58 | **~150** |
| **A** (Mac) | ~52 | 21 (7) + 22 (6) = 13 | **~65** |
| **B** (Windows) | ~50 | 16 (10) + 17 (10) + 18 (8) = 28 | **~78** |
| **C** (Windows) | ~80 | 19 (11) + 20 (6) = 17 | **~97** |

Hat jemand freie Kapazität: B übernimmt #10 von C. A übernimmt #14 von Erik, wenn Erik bei #12/#13 steckt.

## 5. Abhängigkeiten

```
PR #105 (Admin) ─► main ─┬─► #5 Phase B ─► erster Pilot-Release
                         ├─► #6, #11, #13, #16 ─► #18, #17, #19, #20
                         └─► main → pilot/first-store ─► #12 QR-Anker ─► (#19 nutzt Anker-Links)
#2 ─► #4, #21          #1 §10 Zähler ─► #4          #1+#2+#3 ─► #14
#9 Fragebogen ─► #10    #4 Exportformat ─► #10
#7 Messungen ─► Pilotmodus-Entscheidung, #15, #22   #8 ─► #20, #7 §5.3/§7.1
```

## 6. Sprints

| Sprint | Zeitraum | Ziel | Hauptsächlich |
|---|---|---|---|
| 1 | 19.10.–30.10. | Pilotfähig im Testraum | Welle 1: 1, 2, 5A, 7 (Standard + Testraum), 9; Admin-Release (Details `SPRINT_01.md`) |
| 2 | 02.11.–13.11. | Bereit für den Markt | 3, 4, 5B, 6, 7 (großer Raum), 8, 10; Welle 2: 12, 16, 17, 19 |
| 3 | 16.11.–27.11. | Markt erfasst und gemessen (vor dem Weihnachtsgeschäft) | Pilot Phase 2 im Markt; Welle 2: 11, 13, 14, 18, 20, 21 |
| 4 | 30.11.–11.12. | Kalibriert und komfortabel | 15, 22, Fixes aus dem Markt; Vorbereitung Phase 3 (Jänner) |

## 7. Nicht jetzt

`modernize-ios-client-architecture`, `stabilize-upsell-quality-and-request-lifecycle`, `optimize-backend-data-access`, `establish-shared-api-contract`, Rest von `fix-admin-dashboard-contract-drift` und `harden-platform-security-baseline`, AR, Android-App, Werbefilm, Rezepte-Ausbau, Bestände/Bilder. Die Kunden auf Android sind über #19 (Web-Finder) abgedeckt.
