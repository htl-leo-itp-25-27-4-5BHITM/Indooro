# MCindooroApp Testing Notes

## Current Xcode test-target status

The Xcode project currently defines only one native target:

```text
MCindooroApp
```

There is no `MCindooroAppTests` XCTest target in:

```text
swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj/project.pbxproj
```

Because the project has no existing test target, API/model tests were not added
directly to the `.pbxproj`. Creating XCTest targets by hand in a populated
Xcode project is fragile and can easily corrupt build phases, scheme settings,
or user state.

## Recommended next step

Create a new XCTest target in Xcode named:

```text
MCindooroAppTests
```

Then add unit tests for:

- `RecipeSummary`
- `RecipeDetail`
- `RecipeProductMappingResponse`
- `UpsellPlanResponse`
- `UpsellSuggestionResponse`
- backward-compatible `ShoppingListItem` decoding with recipe and upsell fields
- pure merge/deduplication behavior for recipe-sourced and upsell-sourced
  shopping-list items

The tests should use local JSON fixtures only and must not perform real network
calls.


## Navigation test package (`swift test`)

`swift/indooro-EinkaeuferFinal/Package.swift` defines the SwiftPM package
`IndooroNavigationCore`. It compiles only the platform-independent navigation
sources from `indooroApp/` (layout model, graph, pathfinder, Kalman filter,
beacon solver, pose fusion, map matcher, route manager, navigation config) and
adds the test target `IndooroNavigationCoreTests`. The Xcode app target is not
affected; the package exists so navigation logic can be tested on macOS without
a simulator.

Run from `swift/indooro-EinkaeuferFinal`:

```bash
swift test
```

Test support lives in `Tests/IndooroNavigationCoreTests/`:

- `TestLayouts`: loads `Resources/layout-demosupermarkt.json` and injects a
  beacon grid (default one beacon per 8 m x 8 m cell).
- `SyntheticWalk`: walks a polyline with configurable speed, noise, outliers and
  dropouts, tick 0.35 s, seedable (`SplitMix64`).
- `BaselineDefectTests`: `testBaseline_*` tests document known navigation defects
  (see `docs/NAVIGATION_REVIEW.md`) and pass while the defect exists. The measured
  numbers are in `NavigationFixtures/BASELINE.md`. The fix tasks invert them.

The app build is still verified with:

```bash
xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj \
  -scheme MCindooroApp -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
```
