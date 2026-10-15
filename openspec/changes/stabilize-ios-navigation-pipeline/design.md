## Context

Source of truth for the current state is `docs/NAVIGATION_REVIEW.md` (commit `ca5676c`). Paths below are relative to `swift/indooro-EinkaeuferFinal/indooroApp/`.

### Current state (branch `codex/indooro-v2-roughcut`, commit `c2809a1`)

| Area | Current behavior | Source | Review |
|---|---|---|---|
| Tour synchronization | `onChange(userPosition)` and `onChange(rawUserPosition)` call `ShoppingSessionManager.sync`, which re-orders all stops and calls `setRouteTargetPosition` | `Views/Main/ContentView.swift:116-123`, `Managers/ShoppingListManager.swift:1032-1061` | C.1 |
| Active stop | Not stored; `snapshot.currentStop` is the first element of the newest ordering | `Models/ShoppingModels.swift:335` | C.1, C.11 |
| Route rebuild on target set | `RouteManager.setDestination` builds a new A* route, resets progress and off-route timers, no relevance check | `Utilities/RouteManager.swift:60-63, 183-205` | C.1 |
| Measurement paths | CoreLocation ranging and CoreBluetooth RSSI feed the same per-beacon `KalmanFilter` and the same `beacons[i].distance` | `Managers/BeaconManager.swift` `processRSSIWindow`, `stabilizedIBeaconDistance` | C.7 |
| Solve trigger | Update timer (0.35 s) and every `didRange` callback | `BeaconManager.swift:612, 1228` | C.7 |
| Pose fusion | Confidence EMA divided by speed overshoot (cap ≈ 0.41 m/s); `predict()` at 20 Hz overwrites the last pose | `Utilities/PoseFusionService.swift:75-88, 171` | C.3 |
| Map matching | Continuity and disconnected-edge penalty never allow a non-adjacent switch; heading compared to directed edges; route bias | `Utilities/MapMatcher.swift:114-187` | C.2, C.4 |
| Display filter | EMA 0.35, jump confirmation, 1 s / 0.85 m / 3 s gate, fed at ≥ 20 Hz | `BeaconManager.filteredDisplayPosition` | C.6 |
| State machine | Freezes route on low confidence; `.triggerReroute` is a no-op; calibration freeze and unfreeze happen in one call | `Utilities/NavigationStateMachine.swift`, `BeaconManager.applyStateActions` | C.9 |
| Routing | 4-connected 1 m grid, A* without turn penalty, `Set.min` tie-break | `Utilities/IndoorGraph.swift:229-274, 350-446` | C.5 |
| Off-route | > 8 m and alternative gain ≥ 2.0 for 6 s, cooldown 20 s, ≥ 5 m since start, relevance ≥ 6 m; distance measured from a route-biased position | `Utilities/RouteManager.swift:82-166, 351-365` | C.8 |
| Stop ordering | Nearest neighbor with two A* runs per comparator call and a rebuilt graph per call; no 2-opt | `Managers/ShoppingListManager.swift:234-305` | C.10, C.11 |
| SwiftUI | `selectedPreview` computes a snapshot in the view body; `BeaconManager` publishes ≥ 20 Hz | `Views/Main/ShoppingFeatureViews.swift:1181`, `BeaconManager.updateDisplayedUserHeading` | C.10 |
| Shelf matching | Category prefix match; unresolved product keeps the previous target | `BeaconManager.setTargetProduct`, `ShoppingStopResolver.resolveShelf` | C.12 |
| Tests | No test target; no replay | `swift/indooro-EinkaeuferFinal/TESTING.md` | Test section |

### Constraints

- The canonical app is `swift/indooro-EinkaeuferFinal/indooroApp`. Legacy trees get no changes.
- Customer data stays on the device (`swift-client`). Recordings are DEBUG-only and local.
- `swift-client` forbids growing the strict-concurrency diagnostic count above 120.
- The user requirement is explicit: no new filters, timers, thresholds, or special cases without evidence. Thresholds must not be invented; retained values come from earlier repository versions and are marked provisional until calibrated from recorded store walks.
- Hand-editing `MCindooroApp.xcodeproj` to add test targets is considered fragile (`TESTING.md`).

## Goals / Non-Goals

**Goals:**

- One owner for navigation state; position updates never change the stop order or active stop.
- A positioning pipeline with three stages, each with one documented responsibility.
- Deterministic, turn-averse routes; route changes only on genuine deviation or explicit events.
- Reproducible evaluation through replay with defined metrics, comparable across implementations.

**Non-Goals:**

- Package restructuring, Swift 6 migration, `@Observable` migration, off-main positioning actor (owned by `modernize-ios-client-architecture`).
- A new aisle-centerline graph or Admin-maintained routing graph (follow-up candidate).
- Pedestrian dead reckoning, step counting, compass-to-layout alignment, automatic arrival detection.
- AR progress logic (`mobile-ar-navigation` stays unchanged; AR keeps following the camera pose).
- Rotation-aware graph blocking and layout caching (owned by `fix-ios-contract-and-spec-drift`).

## Decisions

### D1 – `NavigationSession` is the single owner

New `Utilities/NavigationSession.swift`, a main-actor `ObservableObject` (consistent with the current app; `modernize-ios-client-architecture` converts it later). State: `plan: [ShoppingStop]`, `activeStopID`, `activeRoute`, `routeProgress`, `offRouteSince`, `mode` (`idle`, `singleTarget`, `tour`). Events:

| Event | Effect |
|---|---|
| `startTour(list)` | Plan all open stops from the planning start point; active stop = first planned |
| `setSingleTarget(point)` | Plan = one stop; route from current projected position |
| `positionUpdated(projected, confidence)` | Update progress; evaluate off-route; never re-plan |
| `stopCompleted` / `stopSkipped` | Mark items; active stop = next stop of the stored plan; route to it |
| `listChanged` | Keep active stop if it still has open items; re-plan only the remaining stops from the active stop's map point |
| `routeModeToggled` / `replanRequested` | Re-plan remaining stops from the current projected position; the active stop may change (explicit user action) |
| `layoutChanged` | Resolve stops again; re-plan; reset route and progress |
| `offRouteConfirmed` | Rebuild only the route to the active stop from the projected position |
| `stopTour` / `clearTarget` | Clear everything |

`ShoppingSessionManager` keeps persistence of the active list and route mode, delegates planning state to the session, and exposes the snapshot built from the stored plan. `ContentView` loses both position `onChange` handlers. `BeaconManager` stops owning `RouteManager`; it publishes position estimates and layout data, and the session owns the route.

Alternative considered: add hysteresis to the nearest-neighbor choice (switch only when another stop is X m closer). Rejected: it adds a threshold without data and still lets the order change while walking; the review shows the order should simply not depend on per-update position.

### D2 – Measurement layer: one source per beacon, solve on the timer only

- Ranging data is preferred per beacon. CoreBluetooth RSSI samples for a beacon are used only when no ranging measurement for that beacon is younger than the stale age (2.0 s).
- Kalman filters are keyed by beacon and source, so the two distance models never mix.
- The iBeacon jump clamp (18 % toward values that differ by more than 2.2 m) and the iBeacon EMA (0.28) are removed; the Kalman filter and the solver's Huber weights already cover noise and outliers.
- `handleRangedIBeacons` only stores measurements. `calculateLocation` runs only from the update timer, which gives fixed time steps.

Open question resolved during implementation: whether CoreBluetooth ever delivers iBeacon manufacturer data on iOS. Recordings (task group 8) show which source is active; if CoreBluetooth never contributes, the fallback stays as a debug path only.

### D3 – Estimator: solver plus one smoother plus one jump gate, at measurement rate

`Utilities/PoseFusionService.swift` is reduced to:

1. Jump gate: a solved point farther than `maxPlausibleSpeed · dt + jumpMargin` from the current estimate is held, where `dt` is the time since the last accepted measurement. It is accepted when `jumpConfirmations` consecutive held points lie within `jumpClusterRadius` of each other. This is the existing display jump logic moved to the measurement rate, where its confirmation count means something (3 ticks ≈ 1 s instead of 150 ms).
2. Smoother: `estimate += alpha(confidence) · (accepted − estimate)` with `alpha = lerp(lowConfidenceAlpha, highConfidenceAlpha, confidence)`. No speed division, no prediction, no velocity state.

Provisional values: `highConfidenceAlpha 0.46`, `lowConfidenceAlpha 0.18` (from `37208b0`), `maxPlausibleSpeed 2.5 m/s`, `jumpMargin 0.85 m`, `jumpConfirmations 3`, `jumpClusterRadius 1.275 m` (from the current display filter). At a 0.35 s tick and 1.3 m/s walking speed the steady-state lag is `v · dt · (1 − α) / α` ≈ 0.53 m at full confidence and ≈ 2.1 m at zero confidence, instead of 6–15 m today. Final values come from replay calibration (task 10.4).

Alternative considered: a 2D constant-velocity Kalman filter. Deferred: it is the cleaner model, but it adds process and measurement noise parameters that cannot be set without data. The EMA keeps one parameter pair; replay metrics decide later whether a Kalman filter is worth it.

Prediction for smooth drawing is replaced by SwiftUI animation of the marker between published positions. CoreMotion stays only for the existing heading fallback inputs; it no longer drives pose prediction.

### D4 – `WalkableProjector` replaces `MapMatcher`

New `Utilities/WalkableProjector.swift`: projects the estimate onto the nearest point of any walkable graph edge (`IndoorGraph.nearestProjection` without distance limit). No history, no heading term, no route bias. Because every free cell is part of the grid graph, the nearest walkable point is at most half a shelf width away, so the projection only moves points out of shelves. Continuity is provided by the estimator, not by the projection.

The projected position is the single position used for display, route progress, off-route evaluation, and planning start points. `rawUserPosition` stays published for the debug overlay only and has no navigation consumers.

### D5 – Deterministic, turn-averse A*

A* state becomes `(node, incomingDirection)`. Cost per step is the edge cost plus `turnPenalty` when the direction changes; `turnPenalty = 1.5` (from the earlier `Pathfinder`, commit `9f79c8d`). Ties in the open set are broken by lower f, then lower g, then lower node id, then direction order. The open set uses a binary heap. The graph is built once per layout revision and shared by the session and the planner. Graph construction (connectivity, blocking) is unchanged so that `fix-ios-contract-and-spec-drift` can still change blocking for rotated elements independently.

Alternative considered: 8-connectivity like the old `Pathfinder`. Rejected for now: it would modify the requirement „Walkable graph is derived from the layout grid“, which `fix-ios-contract-and-spec-drift` also modifies. The turn penalty alone removes the staircase ambiguity.

### D6 – Route progress and remaining route

Progress is the arc length of the projection of the projected position onto the active route polyline. It is monotonic: it may decrease only when the projection is more than `progressBacktrackTolerance` (provisional 3.0 m, current value) behind the maximum progress. The map draws the polyline from the progress point to the end and shows its remaining length. This replaces the per-edge lock, which is meaningless with 1 m edges.

### D7 – One off-route rule

Off-route evidence exists while the projected position is farther than `offRouteDistance` from the active route polyline and confidence is not low. When evidence lasts `offRouteHold`, the route to the active stop is rebuilt from the projected position and the evidence resets. Provisional `offRouteDistance 4.0 m`, `offRouteHold 2.5 s` (from `37208b0`). Removed: alternative-edge gain, cooldown, moved-enough, and relevance gates. A rebuilt route starts at the user, so its distance is zero and no cooldown is needed to prevent loops.

### D8 – Low confidence without a state machine

`NavigationStateMachine` is removed. The session tracks low confidence with the existing thresholds (enter below 0.35, leave at 0.55 or above). While low, off-route evidence is cleared and no reroute happens; the route and the active stop are kept; `isLowConfidence` and the status message „Signal schwach - Kalibrierung empfohlen“ are published. This keeps the input contract that `fix-ios-contract-and-spec-drift` uses for degraded rendering.

### D9 – Planning: distance matrix, nearest neighbor, 2-opt

On each planning event the planner runs one Dijkstra from the start point and one from each stop over the shared graph (plain edge costs) to build a distance matrix. It then builds a nearest-neighbor order (ties: lower `orderSeed`, then title) and improves it with 2-opt on the open path until no move gains more than 0.01 m or 50 passes are done. List-order mode skips both. Planning never runs inside a view body; `ShoppingFeatureViews` reads the stored snapshot, and the planning preview for a non-active list is computed once per list change.

### D10 – Exact shelf matching

Port `LayoutElement.matchesProductLayoutCode` from commit `5936ed4`: the layout code needs at least two segments, the element's category base must equal the first segment exactly, and the element's effective meter must equal the second segment when the element defines one. An unresolved single target clears the target and route (`d8aa91b`); a store switch clears the route target (`eb4d3e8`). The commits are ported by cherry-pick after user approval, or re-implemented if they do not apply cleanly.

### D11 – Test package and replay

- `swift/indooro-EinkaeuferFinal/Package.swift` defines library target `IndooroNavigationCore` with `path: "indooroApp"` and an explicit `sources:` list of the pure navigation files, and test target `IndooroNavigationCoreTests`. `swift test` runs on macOS without touching the Xcode project. `modernize-ios-client-architecture` later moves these files into `IndooroKit`.
- Recorder (DEBUG only): a settings toggle „Messungen aufzeichnen“ writes JSON Lines into the app's Documents folder (`NavigationRecordings/<timestamp>.jsonl`), shareable through the existing share sheet. Line types: `measurement` (t, source, beacon, rssi, accuracy, proximity), `layout` (layout id and revision), `event` (startTour, stopDone, stopSkipped, listChanged, replan, calibrate), and optional `truth` (x, y) markers set by tapping in debug mode.
- `NavigationReplay` feeds recordings through measurement layer → estimator → projector → session with a virtual clock and returns metrics: reroutes per minute, active-stop changes without an event, projected jumps above the gate margin, lag against truth, off-route detection delay, low-confidence toggles, and planning time.
- Synthetic scenario fixtures are generated in tests from layout `layout-demosupermarkt.json` with injected beacons, so tests do not depend on server layouts.

## Risks / Trade-offs

- [Less smoothing feels jumpier at first] → The jump gate stays; replay metrics compare before/after; values are calibrated from recordings before release.
- [No route bias lets the dot leave the route visually] → Intended: the dot shows the estimate; the route stays stable through the off-route hold.
- [Manual stop completion stays required] → Unchanged behavior; automatic arrival is a separate, data-driven follow-up.
- [Overlapping files with `fix-ios-contract-and-spec-drift` and `modernize-ios-client-architecture`] → Ordering below; rebase conflicts are resolved in favor of this change's behavior and the other changes' structure.
- [Cherry-picking from `codex/admin-platform-rebuild` drags unrelated edits] → Port only the Swift hunks of the four commits; ask the user before touching that branch.
- [Removing `NavigationStateMachine` changes status texts] → „Route wird stabil neu berechnet“ and „Manuelle Kalibrierung aktiv“ disappear; „Signal schwach - Kalibrierung empfohlen“ stays.

## Change ordering and ownership

1. `fix-ios-contract-and-spec-drift` may land before or in parallel. Overlap: `IndoorGraph.swift` (it changes blocking; this change changes A* only), `BeaconManager.swift` (it adds `isPositionTrusted`; this change keeps `isLowConfidence`), `MapView.swift`/`StoreMapPage.swift` (marker style versus route trimming).
2. This change must land before `modernize-ios-client-architecture` tasks 5.3–5.5 and 9.x, because those characterization tests would otherwise freeze the defective behavior. Task 11.3 updates that change's tasks to reference this change's behavior and test package.
3. Spec deltas touch different requirements than the other open changes; no requirement is modified twice.

## Migration Plan

1. Land the test package and baseline replay first (no behavior change).
2. Land task groups as separate commits in the order of `tasks.md`; each group keeps the app buildable and the replay suite green.
3. Rollback is `git revert` of the affected group commit. No persisted data format changes: shopping list storage, route mode, and active list keys stay the same. The stored active stop is session state only and is rebuilt on launch from the first planned stop.

## Open Questions

- Which measurement source delivers data in the field, and how many beacons are typically visible per position (review H.1, H.2)?
- Is one layout grid unit one meter in the server layouts (review H.3)?
- Final values for the provisional parameters after calibration from at least three recorded store walks.
- Whether a constant-velocity Kalman filter improves the replay metrics enough to justify its extra parameters (follow-up change).
