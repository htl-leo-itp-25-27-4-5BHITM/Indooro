## 1. OpenSpec And Preparation

- [ ] 1.1 Run `npx -y @fission-ai/openspec@1.3.1 validate stabilize-ios-navigation-pipeline --strict` and fix every reported issue in the change artifacts.
- [ ] 1.2 Re-read `docs/NAVIGATION_REVIEW.md` sections C.1–C.12 and confirm each defect still exists on the implementation branch; note any drift in `design.md`.
- [x] 1.3 Create the implementation branch from the current base; do not work on `main`.
- [x] 1.4 Ask the user whether `fix-ios-contract-and-spec-drift` lands first; record the decision and the resulting merge order in `design.md` under „Change ordering and ownership“.
- [x] 1.5 Ask the user for approval to port the Swift hunks of `5936ed4`, `d8aa91b`, `f118e20`, and `eb4d3e8` from `codex/admin-platform-rebuild`; record the answer.

## 2. Test Package And Baseline (no behavior change)

- [x] 2.1 Add `swift/indooro-EinkaeuferFinal/Package.swift` (swift-tools-version 5.10, macOS 14 and iOS 17 platforms) with library target `IndooroNavigationCore` (`path: "indooroApp"`, explicit `sources:` list: `Models/LayoutData.swift`, `Utilities/Pathfinder.swift`, `Utilities/IndoorGraph.swift`, `Utilities/KalmanFilter.swift`, `Utilities/BeaconPositionSolver.swift`, `Utilities/PoseFusionService.swift`, `Utilities/MapMatcher.swift`, `Utilities/RouteManager.swift`, `Utilities/StabilizedNavigationConfig.swift`) and test target `IndooroNavigationCoreTests`.
- [x] 2.2 Make the listed sources compile in the package without changing behavior (only `public`/`internal` visibility or `import` fixes); confirm the Xcode app target still builds.
- [x] 2.3 Copy `indooroApp/Resources/layout-demosupermarkt.json` into `IndooroNavigationCoreTests/Resources/` and add a `TestLayouts` helper that injects a configurable beacon grid (default: one beacon per 8 m × 8 m cell) into the decoded layout.
- [x] 2.4 Add `SyntheticWalk` test support: generates solved points or beacon distances along a polyline with configurable speed, tick 0.35 s, Gaussian noise, outliers, and beacon dropouts; seedable random generator for determinism.
- [x] 2.5 Port the review harness checks as baseline tests marked „documents defect“ (expected to fail after the fix, then inverted): PoseFusion lag at 1.3 m/s, stationary jitter with 20 Hz predict, MapMatcher jump lock at 2/4/8/20 m, aisle change through a shelf, left-walking heading snap, route-shape count for ±0.4 m starts, nearest-neighbor flips for 0.85 m jitter.
- [x] 2.6 Run `swift test` in `swift/indooro-EinkaeuferFinal` and save the baseline numbers in `swift/indooro-EinkaeuferFinal/NavigationFixtures/BASELINE.md` with commit hash and date.
- [x] 2.7 Update `swift/indooro-EinkaeuferFinal/TESTING.md` with the `swift test` command and the purpose of the package.

## 3. Replay Infrastructure

- [ ] 3.1 Define `NavigationRecordLine` (`measurement`, `layout`, `event`, `truth`) as `Codable` JSON Lines types in `Utilities/NavigationReplay.swift` and add it to the package sources.
- [ ] 3.2 Add a `NavigationRecorder` (DEBUG only, `#if DEBUG`) that appends lines to `Documents/NavigationRecordings/<ISO timestamp>.jsonl` with buffered writes flushed at least every 2 s and on stop.
- [ ] 3.3 Hook the recorder into `BeaconManager` at the raw input points: `recordBeaconSample`, `handleRangedIBeacons` (per beacon), `applyLayout`, and the tour/session event entry points.
- [ ] 3.4 Add the DEBUG-only settings toggle „Messungen aufzeichnen“ to `Views/Main/SettingsSheet.swift` and a share action that uses `Views/Components/ShareSheet.swift`.
- [ ] 3.5 In debug tracking mode, let a long-press on the map write a `truth` line at the pressed point without changing the position.
- [ ] 3.6 Implement `NavigationReplay.run(recording:layout:config:) -> ReplayMetrics` with a virtual clock that drives the update tick every 0.35 s.
- [ ] 3.7 Implement `ReplayMetrics`: reroutes per minute, active-stop changes without event, projected jumps above jump margin, mean and 95th-percentile lag to truth, off-route detection delay, low-confidence toggles, planning time per event.
- [ ] 3.8 Add a test that replays one fixture twice and asserts identical metrics.
- [ ] 3.9 Confirm with `nm`/build settings or a Release build that no recorder symbols exist in Release.

## 4. Shelf Matching

- [x] 4.1 Port `LayoutElement.matchesProductLayoutCode` (exact category base, numeric meter, element meter optional) into `Models/LayoutData.swift`.
- [x] 4.2 Use it in `BeaconManager.setTargetProduct` and `ShoppingStopResolver.resolveShelf`; remove the `starts(with:)` matching.
- [x] 4.3 Clear target and route when a single target does not resolve; clear the route target on store switch and on store layout failure.
- [x] 4.4 Port the matching shelf lookup used by the target card in `Views/Main/StoreMapPage.swift` (`matchingShelf`) to the same function.
- [x] 4.5 Add tests: `520/2/3/1` resolves to `520/2`; `31/1/1/1` does not resolve to `310`; element without meter matches any meter; layout code with one segment does not resolve.

## 5. Measurement Layer

- [x] 5.1 Key Kalman filters by `(beaconName, source)`; create both lazily in `syncKalmanFiltersWithBeacons`.
- [x] 5.2 Store the last ranging timestamp per beacon; in `processBufferAndCalculate` skip RSSI processing for beacons with ranging data younger than the stale age.
- [x] 5.3 Remove the 18 % jump clamp and the 0.28 blend from `stabilizedIBeaconDistance`; keep clamping and the ranging Kalman filter.
- [x] 5.4 Remove the `calculateLocation` call from `handleRangedIBeacons`; position solving runs only from the timer.
- [x] 5.5 Remove `iBeaconAccuracyBlendAlpha` and `maxAcceptedAccuracyJumpMeters` from `StabilizedNavigationConfig`.
- [x] 5.6 Add tests: both sources fresh uses ranging only; ranging stale for 2.5 s uses RSSI; one tick with three ranging callbacks yields one solution.

## 6. Estimator And Projection

- [x] 6.1 Rewrite `PoseFusionService` as the estimator: jump gate at tick rate (`maxPlausibleSpeed`, `jumpMargin`, `jumpConfirmations`, `jumpClusterRadius`) followed by confidence-interpolated EMA; remove speed division, velocity, prediction, heading blending, and radio-fix fusion.
- [x] 6.2 Replace the pose-fusion config with `estimatorHighConfidenceAlpha 0.46`, `estimatorLowConfidenceAlpha 0.18`, `maxPlausibleSpeed 2.5`, `jumpMargin 0.85`, `jumpConfirmations 3`, `jumpClusterRadius 1.275`, each with a `// provisional` comment.
- [x] 6.3 Add `Utilities/WalkableProjector.swift` that returns `graph.nearestProjection(for:)` without distance limit, history, heading, or route bias; add it to the package sources.
- [x] 6.4 In `BeaconManager.processSensorSample`, run estimator then projector; publish `userPosition` from the projected point on every tick; keep `rawUserPosition` for the debug overlay only.
- [x] 6.5 Delete `filteredDisplayPosition`, `shouldHoldForJumpConfirmation`, `resetDisplayPositionFilter`, their state variables, and `DisplayPositionConfig`.
- [x] 6.6 Delete `publishPredictedPose` and its calls in the motion handler and `didUpdateHeading`; keep motion updates only for the heading display path.
- [x] 6.7 Delete `MapMatcher.swift` and `MapMatcherConfig`; remove all references.
- [x] 6.8 Update `runManualCalibration`: project the point, reset the estimator to it, clear jump candidates, publish projected point, and forward a calibration event to the navigation session (task 7.8).
- [x] 6.9 Animate the user marker between published positions in `Views/Main/MapView.swift` (linear animation with the tick duration).
- [x] 6.10 Invert the baseline tests from 2.5 for PoseFusion and MapMatcher and add spec scenario tests: single outlier never accepted; confirmed relocation after three points; walking 0.45 m per tick never held; 1.3 m/s lag below 1.0 m at confidence 1.0; aisle change through a shelf ends in the new aisle; left-walking projection stays on the horizontal line; estimate unchanged without ticks.

## 7. Navigation Session

- [x] 7.1 Add `Utilities/NavigationSession.swift` (`final class`, `ObservableObject`, `@MainActor`) with state `mode`, `plan`, `activeStopID`, `activeRoute`, `routeProgress`, `maxRouteProgress`, `offRouteSince`, `isLowConfidence`, `statusMessage`; add the pure logic parts to the package sources.
- [x] 7.2 Implement events `startTour`, `setSingleTarget`, `positionUpdated`, `stopCompleted`, `stopSkipped`, `listChanged`, `routeModeToggled`, `replanRequested`, `layoutChanged`, `manualCalibration`, `stopTour`, `clearTarget` exactly as in `design.md` D1.
- [x] 7.3 Implement monotonic progress with `progressBacktrackTolerance` and expose `remainingRoutePolyline` and `remainingRouteLength`.
- [x] 7.4 Implement the single off-route rule with `offRouteDistance 4.0` and `offRouteHold 2.5` (provisional) measured from the projected position to the route polyline; rebuild only the route to the active stop.
- [x] 7.5 Implement low-confidence entry below 0.35 and exit at 0.55 or above; clear off-route evidence while low; publish `isLowConfidence` and „Signal schwach - Kalibrierung empfohlen“.
- [x] 7.6 Create the session once in `ContentView` as `@StateObject` and inject it into `StoreMapPage`, `MapView`, `ShoppingFeatureViews`, and the AR container (route polyline only).  (Umgesetzt fuer `StoreMapPage`, `MapView`, AR-Container; `ShoppingFeatureViews` liest keinen Navigationszustand und erreicht die Session ueber `ShoppingSessionManager.bind(navigationSession:)`.)
- [x] 7.7 Move route ownership from `BeaconManager` to the session: remove `routeManager`, `setTargetPosition`, `setRouteTargetPosition`, `setManualTargetPosition`, `clearRouteTarget`, `navigationRoute`, and `targetPosition` publishing from `BeaconManager`, and forward map taps and product targets to the session.
- [x] 7.8 Subscribe the session to `BeaconManager` projected positions and confidence (one Combine subscription in the session, not in a view).
- [x] 7.9 Delete `NavigationStateMachine.swift`, `RouteManager.swift` (logic moved into the session), and the `RouteStabilityConfig` fields for cooldown, minimum movement, alternative gain, segment lock, decision unlock, and relevance.
- [x] 7.10 Keep `isLowConfidence` and `navigationStatusMessage` available to views under the same names so `fix-ios-contract-and-spec-drift` degraded rendering still binds.
- [x] 7.11 Add tests: 60 s noisy stationary updates near two equidistant stops keep the active stop and build no route; short detour of 2.0 s causes no reroute; wrong aisle for 2.5 s causes exactly one reroute to the same stop; low confidence for 10 s at 6 m distance causes no reroute; jitter back 1.5 m keeps progress; turning back 4 m lowers progress; manual calibration keeps the stop order.

## 8. Routing

- [x] 8.1 Add a `BinaryHeap` to `Utilities/IndoorGraph.swift` and switch A* to it.
- [x] 8.2 Extend A* state to `(nodeID, incomingDirection)` with `turnPenalty 1.5` (provisional) added on direction change; keep heuristic admissible (Euclidean).
- [x] 8.3 Implement the deterministic tie-break order: f, g, node id, direction order.
- [x] 8.4 Build the graph once per `layoutRevision` in `BeaconManager.rebuildNavigationPipeline` and expose it read-only to the session and planner; remove graph construction from `MultiStopRoutePlanner`.
- [x] 8.5 Add `IndoorGraph.distances(from:)` (Dijkstra over plain edge costs) for planning.
- [x] 8.6 Add tests: identical edge sequence for 40 starts within ±0.4 m after the first node; one-turn path preferred over five-turn path of equal length; route unchanged across repeated calls; existing „destination inside a shelf“ and „no path“ scenarios still pass.
- [x] 8.7 Delete `Pathfinder.findPath` and its helpers; keep `GridPoint` (move it into `IndoorGraph.swift` if `Pathfinder.swift` becomes empty).

## 9. Shopping Planning

- [x] 9.1 Add `TourPlanner` (pure, package source): distance matrix from start and stops via 8.5, nearest neighbor with tie-break order seed then title, 2-opt on the open path with minimum gain 0.01 m and at most 50 passes (provisional).
- [x] 9.2 Replace `MultiStopRoutePlanner.order` with `TourPlanner`; list-order mode bypasses it.
- [x] 9.3 Resolve the planning start point: projected position, else entrance element center, else list order.
- [x] 9.4 Change `ShoppingSessionManager` to persist active list and route mode only, and to build `ShoppingRouteSnapshot` from the session's stored plan and active stop; `currentStop` returns the active stop.
- [x] 9.5 Remove `onChange(of: beaconManager.userPosition)` and `onChange(of: beaconManager.rawUserPosition)` from `Views/Main/ContentView.swift`.
- [x] 9.6 Map remaining triggers to session events: list revision → `listChanged`, layout revision → `layoutChanged`, tour start/stop, route mode toggle, done/skip.
- [x] 9.7 Implement `listChanged` re-planning from the active stop's map point; rebuild the route only if the active stop changed or moved.
- [x] 9.8 Implement `advanceCurrentStop` without a fresh snapshot: mark items of the stored active stop and advance to the next planned stop.  (Umgesetzt: Der Stopp kommt aus dem gespeicherten Snapshot, die Session rueckt vor; das folgende `sync` plant nichts neu, weil die Stoppmenge dem gespeicherten Plan entspricht, und baut nur den Snapshot aus dem Plan neu.)
- [x] 9.9 Replace `selectedPreview` in `Views/Main/ShoppingFeatureViews.swift` with a stored preview that is recomputed only when the selected list, its open items, the route mode, or the layout revision changes.
- [x] 9.10 Add tests (`TourPlannerTests`; Nearest-Neighbour-Baseline invertiert, `BaselineDefectTests.swift` entfernt): 2-opt result never longer than nearest neighbor; crossing example improves; 100 position changes without event leave the plan untouched; skip advances to the stored next stop even if another stop is closer; adding a product keeps the active stop and route; removing the active stop's items re-plans from the projected position; planning time for 25 stops is recorded.

## 10. Map UI

- [ ] 10.1 Draw only `remainingRoutePolyline` in `Views/Main/MapView.swift` and compute the distance pill from `remainingRouteLength` in `Views/Main/StoreMapPage.swift`.
- [ ] 10.2 Add the „Neu planen“ button to the tour panel in `StoreMapPage.swift` and send `replanRequested`.
- [ ] 10.3 Reduce `BeaconManager` publish frequency: set `userHeadingRadians` only when it changes by at least 1 degree, update `beacons` once per tick as a whole array, and publish `isLowConfidence` only on change.
- [ ] 10.4 Verify with the SwiftUI instrument or `Self._printChanges()` in DEBUG that idle standing does not re-evaluate `ContentView` more than once per tick.

## 11. Documentation And Change Coordination

- [ ] 11.1 Update `StabilizedNavigationConfig.swift` so it matches the requirement „Positioning pipeline parameters have documented defaults“ exactly, including `// provisional` markers.
- [ ] 11.2 Add a „Status“ section to `docs/NAVIGATION_REVIEW.md` that maps each finding C.1–C.13 to the task that fixed it or to the follow-up that owns it.
- [ ] 11.3 Update `openspec/changes/modernize-ios-client-architecture/tasks.md` tasks 5.1–5.6 and 9.x to start from `IndooroNavigationCore`, reuse its tests as characterization tests, and drop work already done here (binary heap, graph per revision, distance matrix); update its `design.md` reference list.
- [ ] 11.4 Update `swift/indooro-EinkaeuferFinal/TESTING.md` with the replay workflow: record, share, add fixture, run `swift test`.

## 12. Calibration With Recorded Walks

- [ ] 12.1 Record at least three store walks with ground-truth markers in DEBUG: standing 60 s at two points, walking a full tour, deliberately entering a wrong aisle, and walking past two nearly equidistant stops.
- [ ] 12.2 Store anonymized recordings (no device identifiers) under `swift/indooro-EinkaeuferFinal/NavigationFixtures/recordings/` and add them as replay tests.
- [ ] 12.3 Replay each recording against the baseline commit and the new implementation; record metrics side by side in `NavigationFixtures/BASELINE.md`.
- [ ] 12.4 Calibrate estimator alphas, jump margin, off-route distance, and off-route hold from the recordings; change only values with evidence, remove their `// provisional` marker, and update the spec delta numbers in this change.
- [ ] 12.5 Record which measurement source delivered data in the field and the typical number of visible beacons; answer the open questions in `design.md`.

## 13. Verification

- [ ] 13.1 Run `swift test` in `swift/indooro-EinkaeuferFinal`; all tests pass.
- [ ] 13.2 Run `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO`.
- [ ] 13.3 Run the same build with `SWIFT_STRICT_CONCURRENCY=complete` and confirm at most 120 unique concurrency diagnostics.
- [ ] 13.4 Run a Release build and confirm the recorder and the „Messungen aufzeichnen“ toggle are absent.
- [ ] 13.5 Simulator check in debug tracking mode: start a tour, tap positions along the route, confirm no stop changes and no route rebuild; tap into a parallel aisle for more than 2.5 s and confirm one reroute to the same stop; „Erledigt“ advances to the planned next stop; „Neu planen“ re-plans.
- [ ] 13.6 Device check in the store: walk one tour with the recorder on; confirm the replay metrics meet the scenario expectations (0 active-stop changes without event, 0 reroutes while on route, 1 reroute for the wrong aisle).
- [ ] 13.7 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.

## 14. Archive

- [ ] 14.1 Confirm every task is done or explicitly moved to a follow-up change.
- [ ] 14.2 Archive with `npx -y @fission-ai/openspec@1.3.1 archive stabilize-ios-navigation-pipeline` after `fix-ios-contract-and-spec-drift` if both modify `mobile-positioning-navigation`.
- [ ] 14.3 Replace any generated „TBD“ purpose text in the touched permanent specs and re-run `validate --all --strict`.
