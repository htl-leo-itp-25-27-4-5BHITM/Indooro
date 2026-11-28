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

## 4. Automated accessibility audits (Task B4)

- [x] 4.1 Add unfiltered iOS 17+ XCUITest accessibility audits for start, loaded store map, product search results, populated shopping list, settings, and first-launch onboarding to the CI UI test target.
- [x] 4.2 Label the map-scale slider in German, give the search field a 44 pt minimum height, allow product names to wrap, explain checklist toggling, and use AccessibilityPalette for diagnostic warning text.

Task 1.1 remains open: automated audits do not produce the requested interactive Accessibility Inspector baseline in `AUDIT.md`. Local Xcode 26.3 rejects both the explicit iOS 18.6 simulator destination and the generic simulator destination because iOS 26.2 platform support is unavailable; the macOS iOS workflow is the runtime audit gate.
