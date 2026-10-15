## Why

Customers report that iOS navigation used to work better than it does now: the Blue Dot jumps or lags, the route line keeps changing, and during a shopping tour the next stop switches back and forth. The read-only review `docs/NAVIGATION_REVIEW.md` (commit `ca5676c`) traced these symptoms to concrete code defects in `swift/indooro-EinkaeuferFinal/indooroApp` and reproduced several of them with the unchanged navigation sources:

- Every raw position update (`rawUserPosition`, unfiltered solver output) and every displayed position update triggers `ShoppingSessionManager.sync` from `ContentView`. Each sync re-runs the nearest-neighbor stop ordering and calls `RouteManager.setDestination`, which builds a fresh A* route and resets route progress. The current stop is never stored; it is whatever the latest ordering puts first. This bypasses all off-route hold and cooldown logic and causes the route and target flapping (review C.1).
- `MapMatcher` can never switch to an edge that is not adjacent to the previously matched edge (`1.25·d + 7 > d − 2.2` for every `d`). After a jump of 2 m or an aisle change through a shelf, the matched position stays in the old aisle until manual calibration (review C.2).
- `PoseFusionService.update` divides the smoothing factor by the speed overshoot, which caps the tracked speed at about 0.41 m/s and leaves the fused pose 6–15 m behind a walking customer. `predict()` overwrites the last pose at 20 Hz, which shortens the update time step and quadruples jitter while standing (review C.3).
- The matcher compares headings against directed edges although grid edges are undirected, which snaps customers walking left or up onto perpendicular edges (review C.4).
- The 4-connected grid A* has no turn penalty and no deterministic tie-break; start points within ±0.4 m produce four different routes to the same shelf (review C.5). The earlier `Pathfinder` (commit `9f79c8d`) avoided this with a turn penalty.
- Twelve stacked smoothing, hold, and gate mechanisms with more than 40 thresholds grew in three commits (`37208b0`, `19ad495`, `1e6b243`). They interact, mask each other, and still do not address the main defect (review C.6–C.9).
- Product targets match shelves by category prefix, so `3/…` can resolve to shelf `310` (review C.12). This is already fixed on branch `codex/admin-platform-rebuild` (commits `5936ed4`, `d8aa91b`, `f118e20`, `eb4d3e8`) but not on the working branch, and it is not yet specified.

The fix is needed now because it is user-visible in every shopping tour, and because `modernize-ios-client-architecture` plans characterization tests that would otherwise freeze the defective behavior.

The guiding rule of this change is to remove and correct mechanisms before adding any. No new filter, timer, or special case is introduced without replay evidence.

## What Changes

- Introduce one navigation session owner in the iOS app that stores the planned stop order, the active stop, the active route, and route progress. Position updates only update progress and off-route evidence. They never re-plan the stop order and never change the active stop.
- Re-plan the remaining stops only on explicit events: tour start, list change, route-mode toggle, layout change, and a new „Neu planen“ action in the tour panel. Completing or skipping a stop advances to the next planned stop without re-optimizing.
- Remove the `onChange(userPosition)` and `onChange(rawUserPosition)` synchronization in `ContentView`, and stop computing tour snapshots inside SwiftUI view bodies.
- Reduce the positioning pipeline to three stages with documented outputs: beacon measurements (one source per beacon, one Kalman filter per beacon and source), one position estimator (solver plus one confidence-weighted smoother with a measurement-rate jump gate and no speed cap), and a history-free walkable projection without route bias or heading terms.
- Remove the display filter layer (1 s / 0.85 m gate, display smoothing), the iBeacon distance EMA and jump clamp, the 20 Hz pose prediction, the matcher continuity and disconnected-edge logic, and the navigation state machine. Low confidence remains visible and suspends rerouting.
- Trigger position solving only from the update timer, not additionally from every ranging callback.
- Make route search deterministic and turn-averse (turn penalty, stable tie-break) and compute the stop distance matrix once per planning event; plan optimized tours with nearest neighbor followed by 2-opt.
- Replace the off-route gates (8 m, alternative-edge gain, 6 s hold, 20 s cooldown, 5 m moved, 6 m relevance) with one rule: distance from the projected position to the active route above a threshold for a hold time while confidence is not low. Rerouting changes only the route to the active stop.
- Draw only the remaining part of the route and compute the remaining distance from monotonic route progress.
- Port the exact shelf matching from `codex/admin-platform-rebuild` and specify it: the category base must match exactly, and an unresolved product clears the target.
- Add a SwiftPM test package for the pure navigation sources, a DEBUG-only local recorder of raw beacon measurements, and a deterministic replay driver with eight scenario tests and stability metrics.
- Treat all retained thresholds as provisional defaults taken from earlier repository versions until they are calibrated from recorded store walks.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `mobile-positioning-navigation`: measurement source selection, Kalman per source, estimator and jump gate at measurement rate, history-free walkable projection, separated position stages, single navigation session owner, deterministic turn-averse routing, monotonic route progress, single off-route rule, low-confidence reroute suspension, exact shelf matching, replay support, revised parameter defaults; removal of motion prediction and the navigation state machine.
- `mobile-shopping-lists`: optimized ordering with nearest neighbor plus 2-opt over a per-plan distance matrix, event-driven planning, stable active stop, stop advance without re-optimization, controlled re-planning on list changes.
- `ios-store-map-experience`: remaining-route drawing and distance, „Neu planen“ action in the tour panel.

## Impact

- iOS code: `Managers/BeaconManager.swift`, `Managers/ShoppingListManager.swift`, `Views/Main/ContentView.swift`, `Views/Main/StoreMapPage.swift`, `Views/Main/MapView.swift`, `Views/Main/ShoppingFeatureViews.swift`, `Utilities/PoseFusionService.swift`, `Utilities/MapMatcher.swift`, `Utilities/RouteManager.swift`, `Utilities/IndoorGraph.swift`, `Utilities/NavigationStateMachine.swift`, `Utilities/StabilizedNavigationConfig.swift`, `Models/LayoutData.swift`, `Models/ShoppingModels.swift`; new `Utilities/NavigationSession.swift`, `Utilities/WalkableProjector.swift`, `Utilities/NavigationReplay.swift`.
- New test package: `swift/indooro-EinkaeuferFinal/Package.swift` with target `IndooroNavigationCore` and test target `IndooroNavigationCoreTests`; replay fixtures under `swift/indooro-EinkaeuferFinal/NavigationFixtures/`.
- Documentation: `docs/NAVIGATION_REVIEW.md` (status section), `swift/indooro-EinkaeuferFinal/TESTING.md`.
- Other changes: `fix-ios-contract-and-spec-drift` and `modernize-ios-client-architecture` touch the same files; ordering and ownership are defined in `design.md`.
- Backend, API, admin UI, deployment: unchanged. Public and protected routes are unchanged; no authentication behavior is touched.
- Privacy: replay recordings exist only in DEBUG builds, stay on the device or developer machine, and are never uploaded.
- Legacy trees `swift/indooro-` and `swift/indooroApp` receive no changes.
