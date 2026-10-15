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
sources from `indooroApp/` (layout model, graph, Kalman filter, beacon solver,
measurement store, estimator, walkable projector, positioning pipeline, navigation
session core, tour planner, navigation config, record/replay types) and adds the
test target `IndooroNavigationCoreTests`. The Xcode app target is not affected;
the package exists so navigation logic can be tested on macOS without a simulator.

Run from `swift/indooro-EinkaeuferFinal`:

```bash
swift test
```

Test support lives in `Tests/IndooroNavigationCoreTests/`:

- `TestLayouts`: loads `Resources/layout-demosupermarkt.json` and injects a
  beacon grid (default one beacon per 8 m x 8 m cell).
- `SyntheticWalk`: walks a polyline with configurable speed, noise, outliers and
  dropouts, tick 0.35 s, seedable (`SplitMix64`).
- `SyntheticRecording`: builds replayable `NavigationRecordLine`s (measurements,
  truth, events) from truth movements on the demo layout.
- The measured baseline numbers (before the fixes) are in `NavigationFixtures/BASELINE.md`.

## Recording and replaying a store walk

DEBUG builds can record raw measurements and replay them offline against the
production pipeline (`PositioningPipeline`, `NavigationSessionCore`, `TourPlanner`).
Release builds contain no recorder.

1. **Record**: in a DEBUG build open Einstellungen -> Debug and switch on
   „Messungen aufzeichnen“. The app writes JSON Lines to
   `Documents/NavigationRecordings/<ISO timestamp>.jsonl` (measurements, layout
   identity, tour events, calibrations). Nothing is sent to a server. A long press
   (0.6 s) on the map writes a `truth` line at that point without moving the
   position; use it to mark where you actually stand. Switch the toggle off to
   flush and close the file.
2. **Share**: the same section offers „Aufzeichnung teilen“ (system share sheet,
   e.g. AirDrop to the Mac). The file name is a timestamp; it contains no device
   identifier. Check it before committing.
3. **Add a fixture**: copy the file to
   `NavigationFixtures/recordings/<name>.jsonl` (real walks) and add a test that
   loads it with `NavigationRecordLine.parse(jsonl:)` and calls
   `NavigationReplay.run(recording:layout:config:)` with the matching layout
   (bundle the layout JSON under `Tests/IndooroNavigationCoreTests/Resources/`).
   Replays run against one layout; the `layout` line only documents which one was
   active. Small synthetic fixtures are generated in tests instead (see
   `NavigationReplayTests`).
4. **Run**: `swift test --filter NavigationReplayTests`. `ReplayMetrics` reports
   reroutes per minute, active-stop changes without an event, projected jumps,
   mean and 95th-percentile lag to truth (meters), off-route detection delay,
   low-confidence toggles and planning time per event. Two replays of the same
   file must give identical metrics (planning wall time excluded); a metric that
   differs is a determinism bug. Metrics are printed as `REPLAY <name> ...` lines.

The app build is still verified with:

```bash
xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj \
  -scheme MCindooroApp -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
```
