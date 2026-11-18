# Positioning (offline comparison, not part of the app)

This directory holds the engine core of the new position calculation and the code that compares it with the current
app pipeline on recorded walks. **No file here is part of the app target.** `MCindooroApp.xcodeproj` does not list
`Positioning/`, no `indooroApp/` file was changed, no flag is switched on, routing is unchanged.

Context: sprint story #195, openspec change `compare-positioning-pipelines`, decision rule
`docs/pilot-readiness/hardware/POSITIONING_DECISION.md`.

## Layout

| Directory | Content |
| --- | --- |
| `Engine/` | Copy of the `PositioningEngine` core from branch `postpilot/ios-architecture` |
| `Compare/` | Truth track, metrics, the two replay paths, CSV/JSON/summary writers (public API: `PositioningComparison`) |
| `CLI/` | `compare-positioning` command line tool (SwiftPM executable `ComparePositioningCLI`) |

All of it is compiled into the SwiftPM target `IndooroNavigationCore` (root `Package.swift`) together with the
navigation sources from `indooroApp/Utilities/`. That is why the engine needs no `public` modifiers.

## Use

```text
scripts/field/compare_positioning.sh <recording.jsonl> --store SPAR-Leonding-002      # from the repo root
cd swift/indooro-EinkaeuferFinal && swift run compare-positioning <recording.jsonl> --layout <layout.json> --out <dir>
cd swift/indooro-EinkaeuferFinal && swift test --filter IndooroPositioningCompareTests
```

Details, outputs and exit codes: `scripts/field/README.md`, section "Zwei Pipelines vergleichen".

How the two paths are driven (`Compare/ComparisonPaths.swift`): `ReplayPlan` fixes the tick schedule once (virtual clock from the
first line, tick every `updateIntervalSeconds`, lines up to the tick time first, no tick inside the warm-up).
`CurrentPipelinePath` feeds `BeaconMeasurementStore` / `RSSISampleBuffer` and calls `PositioningPipeline.tick` like
`BeaconManager`; a test shows it equals `NavigationReplay` tick for tick without warm-up. `EnginePath` creates a
`PositioningEngine` with a manual clock and a radio without samples, hands it the measurements through `ingest` (what a radio
would deliver) and calls `runTick()` once per scheduled tick.

## Provenance of `Engine/`

Source: `origin/postpilot/ios-architecture` at commit `75ec224f7ad6026d7a947b21422eaa5ab4301f8c`,
`swift/indooro-EinkaeuferFinal/Packages/IndooroKit/Sources/`:

| File here | Source path (below `Sources/`) |
| --- | --- |
| `PositioningEngine.swift`, `BeaconRadio.swift`, `BeaconCatalog.swift`, `PositionSnapshot.swift`, `PositioningClock.swift`, `HeadingFusion.swift`, `HeadingProvider.swift`, `MotionProvider.swift`, `IBeaconAdvertisement.swift`, `StreamBroadcaster.swift` | `IndooroPositioning/` |
| `LayoutGraphSnapshot.swift` | `IndooroNavigation/` |
| `MainCompat.swift` | new here (see below) |

Mechanical changes only, nothing else was edited:

1. Line `import IndooroNavigation` removed (same module here).
2. The modifier `public` removed. On `main` the navigation types are `internal`, and a `public` API may not use them.

`MainCompat.swift` adds `BeaconMeasurementStore.activeMeasurementCount(at:)` as an extension. On the postpilot
branch it is a method of the `IndooroNavigation` package target.

Not copied (stay on the postpilot branch): `CoreLocationBeaconRadio`, `CoreLocationHeadingProvider`,
`CoreMotionStepProvider`, `LayoutRepository`, `StoreDetectionService`, `SnapshotTickAdapter`, `ShadowPositioning`
and the `IndooroShadowPositioning` flag. The offline comparison does not need them.

## When `postpilot/ios-architecture` is merged

Delete `Engine/`, remove it from the `IndooroNavigationCore` sources, and let the comparison code import the
`IndooroPositioning` and `IndooroNavigation` package targets. Take the postpilot versions of all files.
