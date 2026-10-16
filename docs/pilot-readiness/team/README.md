# Pilot-Team: Wer macht was, mit welchem Branch

Stand: 16.10.2026. Gesamtplan aller Changes: [ROADMAP.md](ROADMAP.md). Regeln für Agenten: [AGENT_RULES.md](AGENT_RULES.md). Laufender Stand: [STATUS.md](STATUS.md).

## Personen

| Person | Rechner | Bereich | Changes in dieser Reihenfolge | Prompt |
|---|---|---|---|---|
| **Erik** | Mac | Admin-Abschluss, Integration, Navigation, Mess-Replay, App-Tests/CI, Pilot-Bereitschaftsseite, Releases, Partner | Welle 1: Admin-Release → `add-pilot-guided-tour-fallbacks` → `add-ios-app-test-target` → `establish-pilot-field-measurement` [E] → `add-store-pilot-readiness-check`. Welle 2: `add-qr-anchor-positioning` → `complete-admin-parity-evidence` + `add-editor-floorplan-underlay` (Admin-Agent) → `add-ios-pilot-ui-tests` → `improve-positioning-with-motion` | [PROMPT_ERIK.md](PROMPT_ERIK.md), [PROMPT_ADMIN_AGENT.md](PROMPT_ADMIN_AGENT.md) |
| **Person A** | Mac | iOS-App | `prepare-pilot-ios-build` → `add-pilot-study-mode` → `improve-ios-accessibility` → `add-arrival-suggestion` | [PROMPT_PERSON_A_IOS.md](PROMPT_PERSON_A_IOS.md) |
| **Person B** | Windows | Backend, Katalog, Suche, Betrieb, Sicherheit | `release-pilot-backend` (A, dann B) → `add-store-scoped-catalog` → `improve-product-search-quality` → `add-admin-catalog-spreadsheet-import` | [PROMPT_PERSON_B_BACKEND.md](PROMPT_PERSON_B_BACKEND.md) |
| **Person C** | Windows | Feld, Hardware, Daten, Pilot-Kit, Web-Finder, Auswertung | `prepare-pilot-store-operations` → `add-beacon-placement-planner` → `establish-pilot-field-measurement` [C] → `upgrade-customer-web-product-finder` → `prepare-pilot-evaluation` → `add-editor-beacon-coverage-overlay` | [PROMPT_PERSON_C_FIELD_DATA.md](PROMPT_PERSON_C_FIELD_DATA.md) |

Person A = die zweite Person mit MacBook. B und C = die beiden mit Windows. Welche konkreten Teammitglieder das sind, entscheidet ihr; Vorschlag nach Projektauftrag: B = einer der beiden „Server“-Leute, C = „Ortungshardware“.

## Branches

| Branch | Basis | Für | Pull Request nach |
|---|---|---|---|
| `pilot/first-store` | stabilisierte Navigation + Planung | Integration (nur Erik mergt) | später `main` |
| `pilot/erik-guided-tour` | `pilot/first-store` | Erik, Change 1 | `pilot/first-store` |
| `pilot/field-replay` | `pilot/first-store` | Erik, Change 7 [E] | `pilot/first-store` |
| `pilot/ios-pilot-build` | `pilot/first-store` | Person A, Change 2 | `pilot/first-store` |
| `pilot/ios-test-target` | `pilot/first-store` | Erik, Change 3 | `pilot/first-store` |
| `pilot/ios-study-mode` | `pilot/first-store` | Person A, Change 4 | `pilot/first-store` |
| `pilot/release-backend` | `main` + Planung | Person B, Change 5 | `main` |
| `pilot/admin-parity` | `main` + Planung | Erik (Admin-Agent), `complete-admin-parity-evidence` | `main` |
| `pilot/store-readiness` | `main` + Planung | Erik, Change 6 | `main` |
| `pilot/store-operations` | `pilot/first-store` | Person C, Change 9 | `pilot/first-store` |
| `pilot/beacon-planner` | `pilot/first-store` | Person C, Change 8 | `pilot/first-store` |
| `pilot/field-measurement` | `pilot/first-store` | Person C, Change 7 [C] | `pilot/first-store` |
| `pilot/pilot-evaluation` | `pilot/first-store` | Person C, Change 10 | `pilot/first-store` |
| `pilot/qr-anchors`, `pilot/ios-ui-tests`, `pilot/motion-positioning` | `pilot/first-store` | Erik, Welle 2 | `pilot/first-store` |
| `pilot/ios-accessibility`, `pilot/arrival-suggestion` | `pilot/first-store` | Person A, Welle 2 | `pilot/first-store` |
| `pilot/store-catalog`, `pilot/search-quality`, `pilot/catalog-import` | `main` + Planung | Person B, Welle 2 | `main` |
| `pilot/web-finder`, `pilot/editor-coverage` | `main` + Planung | Person C, Welle 2 | `main` |
| `pilot/editor-underlay` | `main` + Planung | Erik (Admin-Agent), Welle 2 | `main` |

Alle Branches sind auf GitHub (Stand 2026-10-16). `main` enthält den Admin-Neubau und die Planung; `pilot/first-store` enthält `main` plus die stabilisierte iOS-Navigation. Login in den Admin: [ADMIN_LOGIN.md](ADMIN_LOGIN.md).

## Was jede Person einmalig braucht

| | Erik / Person A (Mac) | Person B (Windows) | Person C (Windows) |
|---|---|---|---|
| Git + Zugriff auf `htl-leo-itp-25-27-4-5BHITM/Indooro` | ✓ | ✓ | ✓ |
| Node.js (für `npx` OpenSpec) | ✓ | ✓ | ✓ |
| Codex (Windows: WSL2 oder IDE-Erweiterung) | ✓ | ✓ | ✓ |
| Xcode + iPhone | ✓ | – | – (iPhone zum Messen leiht ein Mac-Nutzer mit DEBUG-Build) |
| Java 17+, Docker Desktop | – | ✓ | – |
| Python 3.10+ | optional | ✓ | ✓ |
| kubectl + LeoCloud-Zugang | Erik | nur falls vorhanden | – |
| Laser-Entfernungsmesser, Kreppband | – | – | ✓ |

## Merge-Ablauf

1. Person öffnet PR → Erik prüft (Prüfungen grün, nur eigene Dateien, Tasks abgehakt).
2. Erik mergt in `pilot/first-store` (bzw. B in `main` nach Review durch Erik).
3. Erik meldet im Team-Chat: „bitte `origin/pilot/first-store` mergen“.
4. Nach dem Admin-Merge: Erik mergt `main` in `pilot/first-store` (Change 1, Abschnitt 7).
