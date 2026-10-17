## Why

The pilot depends on a few critical flows working on every build: search a product, read the shelf location, build a tour, mark stops done, set the position manually, work offline. Today these are checked by hand in the simulator. With several people and agents merging into `pilot/first-store` every day, a broken flow would be noticed in the store at the worst moment.

## What Changes

- Add an XCUITest target `MCindooroAppUITests` with deterministic launch arguments (`-uiTesting`) that load a bundled pilot fixture store (layout + products) instead of the network, start in „Ohne Ortung“, and skip the introduction.
- Cover the pilot flows end to end: search with special characters, shelf text, add to list, start tour, route from entrance, „Erledigt“, route from last stop, „Ich bin hier“, offline start, study mode export (when available).
- Run the UI tests in the macOS CI workflow on pull requests to `pilot/first-store`.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ios-client-architecture`: UI test target with fixture mode for pilot flows.

## Impact

- Owner: Erik (Mac). Branch `pilot/ios-ui-tests` after `add-ios-app-test-target`, `prepare-pilot-ios-build` and `add-pilot-guided-tour-fallbacks` are merged.
- iOS: `App/AppEnvironment.swift` gets a UI-testing fixture switch (coordinate with Person A), accessibility identifiers on tested controls (small additions in A- and Erik-owned views, agreed per file), new `MCindooroAppUITests/**`, `.github/workflows/ios.yaml`.
