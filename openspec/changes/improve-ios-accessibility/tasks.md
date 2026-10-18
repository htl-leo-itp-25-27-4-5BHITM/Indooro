## 1. Setup

- [ ] 1.1 Branch `pilot/ios-accessibility` after `prepare-pilot-ios-build` is merged; baseline Accessibility Inspector audit saved to `AUDIT.md`. Notiz: offen, Inspector-Baseline nicht gelaufen (Vorher-Zahlen stammen aus Git und Quelltext, siehe `docs/pilot-readiness/evidence/accessibility/AUDIT.md` Abschnitt 6). (Mensch: Accessibility Inspector läuft nur interaktiv am Simulator/Gerät)

## 2. Implementation

- [x] 2.1 Replace the 22 fixed font sizes in customer views; verify at largest size.
- [x] 2.2 VoiceOver labels/hints for tabs, search, results, list, tour panel, settings.
- [x] 2.3 Map summary accessibility element (agree with Erik for `MapView`/`StoreMapPage`).
- [x] 2.4 Tap targets and contrast fixes.

## 3. Verification

- [x] 3.1 After-audit in `AUDIT.md`; UI test with large text if `add-ios-pilot-ui-tests` exists. Notiz: After-Audit ist statisch (Quelltext, Kontrastrechnung); Inspector nicht gelaufen. `AccessibilityUITests` (XXL, 4 Tests) laufen grün.
- [x] 3.2 Checks green; PR; `STATUS.md`. Notiz: `swift test` 221, App-Tests 22, UI-Tests 16, `openspec validate --all --strict` 64 grün; PR nach `pilot/first-store`. Kein `STATUS.md` im Repo vorhanden.
