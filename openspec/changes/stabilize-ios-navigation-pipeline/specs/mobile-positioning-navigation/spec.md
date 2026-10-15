## MODIFIED Requirements

### Requirement: Positioning pipeline parameters have documented defaults
The iOS positioning and navigation pipeline SHALL read all tuning values from one `StabilizedNavigationConfig` value whose defaults are: update interval 0.35 s, warm-up 1.2 s, stale measurement age 2.0 s, minimum beacons for a solution 3, distance clamp 0.35–11.0 m, path-loss exponent 2.8, default TX power −72 dBm, solver residual scale 0.85 m, solver damping 0.55; estimator smoothing 0.46 at full confidence and 0.18 at zero confidence, maximum plausible speed 2.5 m/s, jump margin 0.85 m, 3 jump confirmations, jump cluster radius 1.275 m; route turn penalty 1.5; progress backtrack tolerance 3.0 m; off-route distance 4.0 m and off-route hold 2.5 s; 2-opt minimum gain 0.01 m and at most 50 passes; confidence low threshold 0.35 and recovery threshold 0.55. Values that have not yet been calibrated from recorded store walks SHALL be marked as provisional in a code comment next to the value.

#### Scenario: A tuning value is changed
- **GIVEN** replay of recorded store walks suggests a different off-route hold time
- **WHEN** the value is changed
- **THEN** it is changed in `StabilizedNavigationConfig`, its provisional marker is updated, and this requirement is updated by an OpenSpec delta

#### Scenario: Removed tuning values are gone
- **GIVEN** the pipeline has been simplified
- **WHEN** a developer searches `StabilizedNavigationConfig`
- **THEN** no display update interval, display smoothing, iBeacon accuracy blend, accuracy jump clamp, map-matcher weight, prediction, reroute cooldown, minimum reroute movement, or route replacement relevance value exists

### Requirement: RSSI samples are windowed and filtered per beacon
WHILE tracking mode is beacon and the warm-up has elapsed, the iOS app SHALL, on every update tick, process the buffered RSSI samples of each layout beacon whose RSSI source is selected by keeping at most the last 12 samples, dropping the minimum and maximum WHEN at least five samples exist, averaging the rest, converting the average to meters with `10^((txPower − rssi) / (10 · 2.8))` clamped to 0.35–11 m, smoothing the distance with a Kalman filter that belongs only to this beacon and the RSSI source (process noise 0.02, measurement noise 4.0), and computing a quality score `0.42 · stability + 0.33 · sampleCount + 0.25 · freshness`. RSSI values 0 and 127 SHALL be ignored. A beacon without samples for longer than the stale age SHALL be reset to zero distance and zero quality, and its RSSI Kalman filter SHALL be reset.

#### Scenario: Five noisy samples
- **GIVEN** samples −70, −72, −90, −71, −55 for one beacon whose RSSI source is selected
- **WHEN** the tick processes them
- **THEN** −90 and −55 are dropped and the average of −72, −71, −70 is used

#### Scenario: Beacon disappears
- **GIVEN** a beacon has not been seen for 2.5 seconds
- **WHEN** the next tick runs
- **THEN** its Kalman filters are reset and it no longer contributes to the solution

### Requirement: iBeacon ranging measurements are stabilized
WHEN CoreLocation ranges a layout beacon with negative RSSI and a finite positive accuracy, the iOS app SHALL clamp the accuracy to 0.35–11 m, SHALL smooth it with a Kalman filter that belongs only to this beacon and the ranging source (process noise 0.02, measurement noise 4.0), SHALL store the filtered value as the beacon distance without any further blending or jump clamping, and SHALL compute quality as `0.42 · signal + 0.38 · distance + 0.20 · proximity` with proximity weights immediate 1.0, near 0.8, far 0.28, unknown 0.05.

#### Scenario: Accuracy jumps from 2 m to 8 m
- **GIVEN** the ranging Kalman filter of a beacon has converged at 2.0 m
- **WHEN** ranging reports 8.0 m once
- **THEN** the stored distance is the Kalman output for input 8.0 m and no 18 % step limit or second blend is applied

### Requirement: Displayed position suppresses implausible jumps
The iOS position estimator SHALL evaluate every solved point at the update tick rate, SHALL hold a solved point that is farther than `maxPlausibleSpeed · dt + jumpMargin` from the current estimate, where `dt` is the time since the last accepted solved point, and SHALL accept held points only WHEN `jumpConfirmations` consecutive held points lie within `jumpClusterRadius` of each other. The displayed position SHALL be the projected position of the latest estimate and SHALL be published on every estimator update without an additional time, distance, or smoothing gate; visual smoothness SHALL come from marker animation only.

#### Scenario: Single outlier
- **GIVEN** the estimate is at 5 m / 5 m
- **WHEN** one solved point at 15 m / 5 m arrives followed by solved points near 5 m / 5 m
- **THEN** the estimate and the displayed position never move toward 15 m / 5 m

#### Scenario: Confirmed relocation
- **GIVEN** the estimate is at 5 m / 5 m
- **WHEN** three consecutive solved points arrive near 15 m / 5 m within 1.275 m of each other
- **THEN** the third point is accepted and the estimate starts moving toward 15 m / 5 m

#### Scenario: Normal walking is not held
- **GIVEN** solved points advance 0.45 m per 0.35 s tick along an aisle
- **WHEN** the estimator processes them
- **THEN** no point is held and the displayed position is updated on every tick

### Requirement: Manual calibration resets the pipeline at a walkable point
WHEN the customer sets the position manually or requests recalibration at the current estimate, the iOS app SHALL project the given point onto the nearest walkable point, SHALL reset the estimator to the projected point, SHALL clear any held jump candidates, SHALL let the navigation session rebuild only the route to the active stop from that point without changing the planned stop order, SHALL publish the projected point as both raw and displayed position, SHALL clear the heading, and SHALL emit a manual calibration event with an increasing revision.

#### Scenario: Calibration during route guidance
- **GIVEN** a tour with active stop „Molkerei“ and a route to it exists
- **WHEN** the customer calibrates at a new point
- **THEN** the route to „Molkerei“ is rebuilt from the projected point, the active stop and stop order are unchanged, and the AR view receives the new calibration revision

### Requirement: Product target resolves to the first matching shelf
WHEN a product becomes the navigation target or a shopping item is resolved to a stop, the iOS app SHALL split the layout code by „/“, SHALL require at least two segments with a numeric second segment, SHALL select the first non-beacon layout element whose category base (the category text before the first „/“) equals the first segment exactly and whose effective meter equals the second segment WHEN the element defines a meter, and SHALL use the element center as destination. IF no element matches, the single target SHALL be cleared together with its route, and the shopping item SHALL be listed as unresolved. WHEN the active store changes or a store layout fails to load, the route target SHALL be cleared.

#### Scenario: Product with meter
- **GIVEN** elements with categories `520/1` and `520/2`
- **WHEN** a product with layout code `520/2/3/1` becomes the target
- **THEN** the destination is the center of the `520/2` element

#### Scenario: Category prefix does not match
- **GIVEN** the only shelf has category `310`
- **WHEN** a product with layout code `31/1/1/1` becomes the target
- **THEN** no shelf matches and the target and route are cleared

### Requirement: Off-route rerouting is rate-limited
The iOS navigation session SHALL record off-route evidence only WHILE the projected position is farther than `offRouteDistance` from the active route polyline and confidence is not low, SHALL clear the evidence as soon as either condition stops holding, and WHEN the evidence has lasted `offRouteHold` SHALL rebuild only the route to the active stop from the projected position and clear the evidence. No other gate (cooldown, minimum movement, alternative-edge gain, or route replacement relevance) SHALL decide about rerouting. Rerouting SHALL NOT change the planned stop order or the active stop. A route whose start and destination resolve to the same graph node SHALL be treated as no route.

#### Scenario: Short detour
- **GIVEN** the customer is more than 4.0 m from the route for 2.0 seconds
- **WHEN** they return within 4.0 m of the route
- **THEN** no reroute is performed

#### Scenario: Wrong aisle
- **GIVEN** a tour with active stop „Backwaren“ and the customer walks into a parallel aisle
- **WHEN** the projected position stays more than 4.0 m from the route for 2.5 seconds with normal confidence
- **THEN** exactly one new route to „Backwaren“ is built from the projected position and the stop order is unchanged

## ADDED Requirements

### Requirement: Each beacon uses one measurement source at a time
The iOS app SHALL use CoreLocation ranging measurements for a layout beacon WHILE a ranging measurement of that beacon is younger than the stale measurement age, and SHALL use CoreBluetooth RSSI samples for that beacon only otherwise. Measurements of the two sources SHALL never be fed into the same filter or overwrite each other's distance within one tick.

#### Scenario: Both sources see the same beacon
- **GIVEN** a beacon is ranged by CoreLocation and also advertises a local name containing „Indooro“
- **WHEN** the next update tick runs
- **THEN** only the ranging distance of that beacon is used and the RSSI Kalman filter of that beacon is not updated with ranging values

#### Scenario: Ranging stops for one beacon
- **GIVEN** the last ranging measurement of a beacon is 2.5 seconds old and RSSI samples of it are fresh
- **WHEN** the next update tick runs
- **THEN** the beacon contributes its RSSI-based distance

### Requirement: Position is solved only on the update tick
The iOS app SHALL solve the position only from the update timer. Ranging callbacks, CoreBluetooth discoveries, compass updates, and motion updates SHALL only store measurements or heading data and SHALL NOT trigger position solving, estimation, projection, or route evaluation.

#### Scenario: Several ranging callbacks per second
- **GIVEN** three ranging constraints deliver callbacks within one 0.35 s tick
- **WHEN** the tick ends
- **THEN** exactly one position solution and one estimator update are computed for that tick

### Requirement: Position estimate is smoothed without speed caps
The iOS position estimator SHALL smooth accepted solved points with `estimate += alpha · (point − estimate)`, where `alpha` is interpolated linearly between the zero-confidence and full-confidence smoothing values by the current confidence, and SHALL NOT scale `alpha` by an estimated speed, extrapolate velocity, or update the estimate between update ticks.

#### Scenario: Walking at normal speed
- **GIVEN** confidence is 1.0 and the customer walks 1.3 m/s along a straight aisle with exact solved points
- **WHEN** 20 seconds of ticks are processed
- **THEN** the estimate trails the true position by less than 1.0 m

#### Scenario: Standing still between ticks
- **GIVEN** no new tick has run
- **WHEN** motion or compass updates arrive
- **THEN** the estimate does not change

### Requirement: Projected position is history-free and unbiased
The iOS app SHALL project every estimate onto the nearest point of the walkable graph without using previous projections, heading, or the active route. The projection SHALL only move estimates that lie inside blocked cells or between graph edges onto the nearest walkable point.

#### Scenario: Aisle change through a shelf
- **GIVEN** the previous projected position lies in aisle A
- **WHEN** the estimate moves across a shelf into aisle B
- **THEN** the projected position lies in aisle B as soon as aisle B is the nearest walkable area

#### Scenario: Walking left in an aisle
- **GIVEN** the estimate is in a horizontal aisle and the customer walks toward smaller x
- **WHEN** the estimate is projected
- **THEN** the projected point lies on the aisle's horizontal walkable line, independent of the walking direction

### Requirement: Position stages have defined consumers
The iOS app SHALL keep three position stages: the solved point (debug overlay only), the estimate (input to projection only), and the projected position. The projected position SHALL be the only position used for the Blue Dot, route progress, off-route evaluation, route start points, and planning start points.

#### Scenario: Raw solved point changes
- **GIVEN** a tour is active
- **WHEN** only the solved point changes and the projected position stays the same
- **THEN** no planning, route building, or progress change happens

### Requirement: Navigation session is the single owner of route and active stop
The iOS app SHALL have exactly one navigation session object that owns the planned stop order, the active stop, the active route, route progress, and off-route evidence. Position updates SHALL only update route progress and off-route evidence. Only the events tour start, single-target selection, stop completed, stop skipped, list changed, route mode toggled, replan requested, layout changed, confirmed off-route, manual calibration, tour stop, and target cleared SHALL change the plan, the active stop, or the route.

#### Scenario: Customer stands near the boundary between two stops
- **GIVEN** a tour is active with active stop A and stop B at almost the same route distance
- **WHEN** 60 seconds of noisy position updates arrive
- **THEN** the active stop stays A and the route is not rebuilt

#### Scenario: View updates do not plan
- **GIVEN** a tour is active
- **WHEN** SwiftUI re-evaluates any view body
- **THEN** no stop ordering, graph construction, or route search is executed

### Requirement: Route search is deterministic and turn-averse
The iOS app SHALL build the walkable graph once per applied layout revision and share it for routing and planning. Route search SHALL add the turn penalty to the path cost whenever the walking direction changes between consecutive edges, SHALL use a binary-heap open set, and SHALL break cost ties by lower f, lower g, lower node id, and a fixed direction order, so that identical inputs always yield identical routes.

#### Scenario: Small start jitter
- **GIVEN** a fixed destination shelf
- **WHEN** routes are requested from 40 start points within ±0.4 m of one walkable point
- **THEN** all routes after their first graph node follow the same edge sequence

#### Scenario: Straight corridor preferred
- **GIVEN** two equally long paths, one with one turn and one with five turns
- **WHEN** a route is requested
- **THEN** the path with one turn is returned

### Requirement: Route progress is monotonic along the active route
The iOS navigation session SHALL compute route progress as the arc length of the projection of the projected position onto the active route polyline, SHALL keep the maximum progress reached, and SHALL decrease progress only WHEN the new projection lies more than the backtrack tolerance behind the maximum. The remaining route SHALL be the polyline from the progress point to the destination.

#### Scenario: Jitter backwards
- **GIVEN** progress is 12.0 m on a 30 m route
- **WHEN** the projected position falls back to 10.5 m on the route
- **THEN** progress stays 12.0 m

#### Scenario: Customer turns back
- **GIVEN** progress is 12.0 m on a 30 m route
- **WHEN** the projected position falls back to 8.0 m on the route
- **THEN** progress becomes 8.0 m

### Requirement: Low confidence suspends rerouting
The iOS navigation session SHALL enter low confidence WHEN confidence drops below the low threshold and SHALL leave it WHEN confidence reaches the recovery threshold. WHILE in low confidence, the session SHALL keep the active route and the active stop, SHALL clear off-route evidence, SHALL publish `isLowConfidence = true`, and SHALL publish the status message „Signal schwach - Kalibrierung empfohlen“. Leaving low confidence SHALL clear the status message.

#### Scenario: Confidence recovers between thresholds
- **GIVEN** the session is in low confidence
- **WHEN** confidence rises to 0.45
- **THEN** the session stays in low confidence and no reroute happens

#### Scenario: Off-route during weak signal
- **GIVEN** confidence is 0.2 and the projected position is 6 m from the route for 10 seconds
- **WHEN** the session evaluates off-route evidence
- **THEN** no reroute happens and the route stays visible

### Requirement: Navigation can be recorded and replayed in debug builds
DEBUG builds of the iOS app SHALL offer a settings toggle „Messungen aufzeichnen“ that writes beacon measurements, layout identity, navigation events, and optional ground-truth markers as JSON Lines into the app's local Documents folder and SHALL offer to share the file. Release builds SHALL NOT contain the recorder. A replay driver SHALL feed recordings through the measurement layer, estimator, projection, and navigation session with a virtual clock and SHALL report reroutes per minute, active-stop changes without an event, projected jumps above the jump margin, lag against ground truth, off-route detection delay, and low-confidence toggles.

#### Scenario: Recording a store walk
- **GIVEN** a DEBUG build with the toggle enabled
- **WHEN** the developer walks a tour and stops recording
- **THEN** a JSON Lines file with measurement and event lines exists locally and nothing is sent to a server

#### Scenario: Replaying the same file twice
- **GIVEN** one recording
- **WHEN** it is replayed twice
- **THEN** both runs report identical metrics

## REMOVED Requirements

### Requirement: Navigation state machine governs route freezing
**Reason**: The state machine's reroute action was a no-op, calibration froze and unfroze the route in one call, and low-confidence handling is a single flag. Its responsibilities move to the navigation session.
**Migration**: Use „Low confidence suspends rerouting“ and „Navigation session is the single owner of route and active stop“. The status messages „Route wird stabil neu berechnet“ and „Manuelle Kalibrierung aktiv“ are no longer shown.

### Requirement: Motion data drives short-term prediction
**Reason**: The 20 Hz prediction overwrote the fused pose, shortened the update time step, and multiplied stationary jitter; it compensated for a speed cap that is removed.
**Migration**: The estimate changes only on update ticks („Position estimate is smoothed without speed caps“); the map marker animates between published positions. Device motion remains available for heading inputs only.
