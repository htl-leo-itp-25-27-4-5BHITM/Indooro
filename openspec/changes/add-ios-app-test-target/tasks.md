## 1. Setup

- [ ] 1.1 Check out `pilot/ios-test-target`, merge `origin/pilot/first-store`; confirm `swift test` and the simulator build pass.
- [ ] 1.2 Human step (Xcode UI, ~5 min): create the unit testing bundle `MCindooroAppTests` per design decision 1; commit the project change alone with message `test(ios): add MCindooroAppTests target (add-ios-app-test-target 1.2)`.
- [ ] 1.3 Run `xcodebuild test -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO` (adjust the simulator name) with one placeholder test.
- [ ] 1.4 Run `npx -y @fission-ai/openspec@1.3.1 validate add-ios-app-test-target --strict`.

## 2. Fixtures

- [ ] 2.1 Capture anonymous responses with `curl`: `GET /api/mobile/stores`, `GET /api/mobile/stores/{id}/layout/current`, `GET /api/products/search?q=milch`, `GET /api/mobile/recipes`, one recipe detail and product mapping; store under `swift/indooro-EinkaeuferFinal/Fixtures/` (this also fulfils `fix-ios-contract-and-spec-drift` 1.3; mark it).
- [ ] 2.2 Add edge-case fixtures: product list with one malformed element, layout with rotated shelf and missing label, shopping list v1 JSON without recipe/upsell fields.

## 3. Tests

- [ ] 3.1 Decoding tests for stores, layout response, products (lossy array if present), recipes, upsell plan/suggestion.
- [ ] 3.2 Shopping list tests: v1 decoding, persistence round trip (`UserDefaults` suite per test), merge/deduplication of recipe- and upsell-sourced items.
- [ ] 3.3 `AppEnvironment` tests (if `prepare-pilot-ios-build` is merged; otherwise mark waiting).
- [ ] 3.4 Search URL building tests (`Milch & Käse`, `a+b`, `50%`, `#1`).
- [ ] 3.5 Study export formatting tests (if `add-pilot-study-mode` is merged; otherwise mark waiting).
- [ ] 3.6 Record every defect found by the tests as a blocker for the file owner in `STATUS.md`; do not fix files owned by others.

## 4. CI

- [ ] 4.1 Add `.github/workflows/ios.yaml` per design decision 3 (pull requests to `pilot/first-store` and `main`, paths `swift/indooro-EinkaeuferFinal/**`).
- [ ] 4.2 Push and confirm the workflow passes on GitHub; paste the run link into the pull request.
- [ ] 4.3 Update `swift/indooro-EinkaeuferFinal/TESTING.md` (new target, fixtures, CI).

## 5. Handover

- [ ] 5.1 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 5.2 Open a pull request `pilot/ios-test-target` → `pilot/first-store`; update `STATUS.md`.
