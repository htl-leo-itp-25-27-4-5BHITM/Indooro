## 1. Setup

- [ ] 1.1 Branch `pilot/ios-accessibility` after `prepare-pilot-ios-build` is merged; baseline Accessibility Inspector audit saved to `AUDIT.md`.

## 2. Implementation

- [ ] 2.1 Replace the 22 fixed font sizes in customer views; verify at largest size.
- [ ] 2.2 VoiceOver labels/hints for tabs, search, results, list, tour panel, settings.
- [ ] 2.3 Map summary accessibility element (agree with Erik for `MapView`/`StoreMapPage`).
- [ ] 2.4 Tap targets and contrast fixes.

## 3. Verification

- [ ] 3.1 After-audit in `AUDIT.md`; UI test with large text if `add-ios-pilot-ui-tests` exists.
- [ ] 3.2 Checks green; PR; `STATUS.md`.
