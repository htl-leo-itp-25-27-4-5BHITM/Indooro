## 1. Setup

- [ ] 1.1 Start when the prerequisite changes are merged; branch `pilot/ios-ui-tests`; validate this change.
- [ ] 1.2 Human step (Xcode UI): add UI testing bundle `MCindooroAppUITests`.

## 2. Fixture Mode

- [ ] 2.1 Create `swift/indooro-EinkaeuferFinal/Fixtures/ui-test-store/` (layout with entrance, 6 labeled shelves, 2 anchors; 30 products).
- [ ] 2.2 Add `-uiTesting` handling in `AppEnvironment` (agree with Person A) and data providers that read fixtures.
- [ ] 2.3 Request/add accessibility identifiers (list in `design.md`).

## 3. Tests

- [ ] 3.1 Search „Milch & Käse“ and a typo; result and shelf text visible.
- [ ] 3.2 Tour: add 3 products, start, route from entrance label, „Erledigt“, route from last stop label.
- [ ] 3.3 „Ich bin hier“: tap mode, tap map, route rebuilt.
- [ ] 3.4 Offline start shows fixture store with offline description.
- [ ] 3.5 Study mode export (if merged; otherwise mark waiting).

## 4. CI and Handover

- [ ] 4.1 Add UI tests to `.github/workflows/ios.yaml`; green run linked in PR.
- [ ] 4.2 Update `TESTING.md`; pull request; `STATUS.md`.
