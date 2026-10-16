## 1. Setup

- [x] 1.1 Check out `pilot/ios-test-target`, merge `origin/pilot/first-store`; confirm `swift test` and the simulator build pass.
- [ ] 1.2 Human step (Xcode UI, ~5 min): create the unit testing bundle `MCindooroAppTests` per design decision 1; commit the project change alone with message `test(ios): add MCindooroAppTests target (add-ios-app-test-target 1.2)`. **Human step open (Erik):** see `docs/pilot-readiness/team/STATUS.md`, „Wartet auf Menschen“.
- [ ] 1.3 Run `xcodebuild test -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO` (adjust the simulator name) with one placeholder test. Waiting for 1.2.
- [x] 1.4 Run `npx -y @fission-ai/openspec@1.3.1 validate add-ios-app-test-target --strict`.

## 2. Fixtures

- [x] 2.1 Capture anonymous responses with `curl`: `GET /api/mobile/stores`, `GET /api/mobile/stores/{id}/layout/current`, `GET /api/products/search?q=milch`, `GET /api/mobile/recipes`, one recipe detail and product mapping; store under `swift/indooro-EinkaeuferFinal/Fixtures/` (this also fulfils `fix-ios-contract-and-spec-drift` 1.3; mark it). (also fulfils `fix-ios-contract-and-spec-drift` 1.3; the upsell plan is hand-made because `POST /mobile/upsell/plan` is not an anonymous GET)
- [x] 2.2 Add edge-case fixtures: product list with one malformed element, layout with rotated shelf and missing label, shopping list v1 JSON without recipe/upsell fields.

## 3. Tests

- [x] 3.1 Decoding tests for stores, layout response, products (lossy array if present), recipes, upsell plan/suggestion. (in the SwiftPM test target: the pure models are part of the package, so `swift test` covers decoding)
- [ ] 3.2 Shopping list tests: v1 decoding, persistence round trip (`UserDefaults` suite per test), merge/deduplication of recipe- and upsell-sourced items. Decoding of v1 JSON and a round trip are done in `ShoppingListDecodingTests`; persistence with a `UserDefaults` suite and merge/deduplication need `ShoppingListManager`, i.e. the Xcode target (waiting for 1.2).
- [ ] 3.3 `AppEnvironment` tests (if `prepare-pilot-ios-build` is merged; otherwise mark waiting). Waiting: `prepare-pilot-ios-build` not merged and target 1.2 missing.
- [ ] 3.4 Search URL building tests (`Milch & Käse`, `a+b`, `50%`, `#1`). Waiting: `prepare-pilot-ios-build` 4.1 (encoded query items) not merged; current `ProductSearchStore` uses `.urlQueryAllowed`, which leaves `&`, `+`, `#` unescaped.
- [ ] 3.5 Study export formatting tests (if `add-pilot-study-mode` is merged; otherwise mark waiting). Waiting: `add-pilot-study-mode` not merged.
- [x] 3.6 Record every defect found by the tests as a blocker for the file owner in `STATUS.md`; do not fix files owned by others. (defects recorded in `STATUS.md`, section „Hinweise an Personen“)

## 4. CI

- [x] 4.1 Add `.github/workflows/ios.yaml` per design decision 3 (pull requests to `pilot/first-store` and `main`, paths `swift/indooro-EinkaeuferFinal/**`).
- [ ] 4.2 Push and confirm the workflow passes on GitHub; paste the run link into the pull request. Runs when the pull request is opened; link goes into the PR description.
- [x] 4.3 Update `swift/indooro-EinkaeuferFinal/TESTING.md` (new target, fixtures, CI).

## 5. Handover

- [ ] 5.1 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 5.2 Open a pull request `pilot/ios-test-target` → `pilot/first-store`; update `STATUS.md`.
