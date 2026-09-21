# mobile-positioning-navigation Specification

## Purpose
Defines iOS customer positioning and route guidance behavior, including iBeacon/iBKS beacon anchors, Blue Dot confidence, sensor smoothing, route-line guidance, live rerouting, offline layout fallback, and mobile platform scope.
## Requirements
### Requirement: iOS positioning uses configured beacon anchors
The mobile app SHALL derive customer position from beacons placed in the active layout and SHALL treat each beacon anchor as a known map coordinate with UUID and optional major/minor identifiers.

#### Scenario: Layout contains positioned beacons
- **GIVEN** the active layout contains beacon elements with map coordinates and identifiers
- **WHEN** the mobile app loads the layout
- **THEN** the app can build the beacon anchor set used for positioning

#### Scenario: Beacon identity is incomplete
- **GIVEN** a layout beacon element lacks a usable UUID or required identifier
- **WHEN** the mobile app configures scanning
- **THEN** that element is not used as a reliable positioning anchor

### Requirement: iBeacon ranging is the primary BLE mode for MVP
The mobile app SHALL support iBeacon ranging for the Accent Systems iBKS USB beacon setup and MAY keep generic BLE RSSI scanning as a fallback/debug mode.

#### Scenario: iBeacon-capable hardware is configured
- **GIVEN** iBKS USB beacons are configured as iBeacon transmitters
- **WHEN** the mobile app scans in normal customer mode
- **THEN** it matches ranged beacons by UUID and major/minor where available

#### Scenario: Ranging cannot be started
- **GIVEN** iBeacon ranging is unavailable because permissions or platform state block it
- **WHEN** the mobile app starts positioning
- **THEN** it exposes a clear positioning status instead of silently showing a trusted Blue Dot

### Requirement: Blue Dot requires enough fresh beacon data
The mobile app SHALL display a trusted Blue Dot only when enough fresh beacon measurements exist for a position solution, with three usable beacons as the MVP threshold for triangulation/trilateration.

#### Scenario: Three usable beacons are visible
- **GIVEN** at least three active layout beacons have fresh measurements
- **WHEN** the mobile app computes position
- **THEN** the Blue Dot can be updated from the solved estimate and confidence

#### Scenario: Fewer than three usable beacons are visible
- **GIVEN** only one or two usable beacons are visible
- **WHEN** the mobile app computes position for MVP navigation
- **THEN** it must not present the position as a fully trusted Blue Dot

#### Scenario: Single-beacon proximity fallback is shown
- **GIVEN** fewer than three usable beacons are visible and a proximity fallback is implemented
- **WHEN** the app presents fallback location feedback
- **THEN** it may show an approximate radius/proximity state without claiming exact aisle-side position

### Requirement: Positioning is smoothed and confidence-aware
The mobile app SHALL smooth noisy radio measurements and sensor signals so the displayed position remains stable while still responding to real movement.

#### Scenario: RSSI measurements fluctuate
- **GIVEN** beacon RSSI values fluctuate while the user is stationary
- **WHEN** the mobile app updates the displayed position
- **THEN** filters, confidence, and map matching reduce visible Blue Dot jitter

#### Scenario: Sensor data is available
- **GIVEN** motion, heading, or step-like sensor data is available on the device
- **WHEN** recent beacon estimates are stale or noisy
- **THEN** the app may use sensor fusion to predict short movement without storing customer position server-side

### Requirement: Positioning quality targets are explicit
The mobile app SHALL target approximately one-meter practical positioning quality for navigation, SHALL keep stationary Blue Dot jitter below two meters where feasible, and SHALL keep movement smooth enough for mid-range phones.

#### Scenario: Position estimate is stable enough
- **GIVEN** beacon coverage and layout calibration are adequate
- **WHEN** the customer stands still in the market
- **THEN** the displayed Blue Dot should not jump more than about two meters

#### Scenario: Position quality is insufficient
- **GIVEN** confidence drops below the navigation threshold
- **WHEN** the app would otherwise draw precise guidance
- **THEN** it shows degraded/low-confidence behavior instead of over-promising exact position

### Requirement: Route guidance is a map line, not turn-by-turn MVP
The mobile navigation MVP SHALL draw a route line from the current customer position to the product target and SHALL NOT require spoken or textual turn-by-turn instructions as baseline behavior.

#### Scenario: Product route is available
- **GIVEN** the user has selected a product with a resolved target location
- **WHEN** the app calculates a route
- **THEN** the customer sees a route line on the store map from Blue Dot to target

#### Scenario: Turn-by-turn is requested
- **GIVEN** a future change requests turn-by-turn arrows or instructions
- **WHEN** that change is proposed
- **THEN** it must define instruction generation, UI behavior, and recalculation rules before implementation

### Requirement: Routes recalculate when the user leaves the path
The mobile app SHALL support live route recalculation when the user's matched position has remained meaningfully off the current route.

#### Scenario: User deviates from route
- **GIVEN** an active route exists and the user has moved away from it
- **WHEN** the distance from user position to route exceeds the configured threshold for the configured hold time
- **THEN** the app recalculates or updates the route if cooldown and confidence rules allow it

#### Scenario: User briefly jitters off route
- **GIVEN** radio jitter briefly places the user outside the route
- **WHEN** the off-route condition does not persist long enough
- **THEN** the app keeps the current route to avoid battery waste and visual churn

### Requirement: Mobile layout can fall back when network is unavailable
The mobile app SHALL keep the map usable during short network failures by using persisted layout selection, recently known layout versions, or bundled layout JSON when server layout retrieval fails.

#### Scenario: Current server layout loads
- **GIVEN** the mobile app can reach the backend
- **WHEN** it opens the active store map
- **THEN** it loads the current server layout or the selected version

#### Scenario: Network is unavailable
- **GIVEN** the mobile app cannot reach the backend during startup
- **WHEN** it needs a map for customer navigation
- **THEN** it uses the best available cached, historical, or bundled layout fallback and clearly distinguishes fallback state

### Requirement: Product search requires network while map display can survive outages
The mobile experience SHALL treat product search as online behavior while allowing already available map data to remain visible during short connectivity loss.

#### Scenario: Search is online
- **GIVEN** the customer enters a product query
- **WHEN** the mobile app searches the catalog
- **THEN** the app calls the public backend search endpoint and handles unavailable network as a search error

#### Scenario: Map is already loaded
- **GIVEN** a layout has already been loaded or cached
- **WHEN** the network is lost temporarily
- **THEN** the map remains visible for orientation even if new catalog searches cannot complete

### Requirement: Mobile platform scope is iOS first
The mobile app SHALL treat iOS 18.5 or later on iPhone and iPad as the current primary platform baseline, matching the deployment target of the canonical Xcode project, and SHALL treat Android parity as future scope unless explicitly specified.

#### Scenario: iOS app is built
- **GIVEN** the current app is Swift/SwiftUI and uses Apple BLE/location APIs
- **WHEN** mobile behavior is changed
- **THEN** iOS constraints and permissions are addressed first and the change remains buildable with deployment target iOS 18.5

#### Scenario: Older iOS support is requested
- **GIVEN** a stakeholder asks for iOS versions below 18.5
- **WHEN** the change is proposed
- **THEN** it must list every API used by the app that requires iOS 17 or later and define replacements before lowering the deployment target

#### Scenario: Android support is requested
- **GIVEN** a future change asks for Android parity
- **WHEN** the change is proposed
- **THEN** it must define Android-specific BLE, permission, layout, and routing requirements

### Requirement: Positioning pipeline parameters have documented defaults
The iOS positioning pipeline SHALL read all tuning values from one `StabilizedNavigationConfig` value whose defaults are: update interval 0.35 s, warm-up 1.2 s, stale measurement age 2.0 s, minimum beacons for a solution 3, distance clamp 0.35–11.0 m, path-loss exponent 2.8, default TX power −72 dBm, solver residual scale 0.85 m, solver damping 0.55, iBeacon accuracy blend alpha 0.28, maximum accepted accuracy jump 2.2 m; pose fusion smoothing 0.28 (0.08 at low confidence), heading smoothing 0.28, maximum speed 1.45 m/s, stale radio fix 1.8 s, prediction window 0.45 s; display update interval 1.0 s, minimum display change 0.85 m, maximum display staleness 3.0 s, maximum plausible speed 2.5 m/s, 3 jump confirmations, display smoothing 0.35; map-matcher candidate radius 2.4 m and maximum projection distance 3.8 m; confidence low threshold 0.35 and recovery threshold 0.55.

#### Scenario: A tuning value is changed
- **GIVEN** field tests suggest a different stale-measurement age
- **WHEN** the value is changed
- **THEN** it is changed in `StabilizedNavigationConfig` and this requirement is updated by an OpenSpec delta

### Requirement: RSSI samples are windowed and filtered per beacon
WHILE tracking mode is beacon and the warm-up has elapsed, the iOS app SHALL, on every update tick, process the buffered RSSI samples of each layout beacon by keeping at most the last 12 samples, dropping the minimum and maximum WHEN at least five samples exist, averaging the rest, converting the average to meters with `10^((txPower − rssi) / (10 · 2.8))` clamped to 0.35–11 m, smoothing the distance with a per-beacon Kalman filter (process noise 0.02, measurement noise 4.0), and computing a quality score `0.42 · stability + 0.33 · sampleCount + 0.25 · freshness`. RSSI values 0 and 127 SHALL be ignored. A beacon without samples for longer than the stale age SHALL be reset to zero distance and zero quality.

#### Scenario: Five noisy samples
- **GIVEN** samples −70, −72, −90, −71, −55 for one beacon
- **WHEN** the tick processes them
- **THEN** −90 and −55 are dropped and the average of −72, −71, −70 is used

#### Scenario: Beacon disappears
- **GIVEN** a beacon has not been seen for 2.5 seconds
- **WHEN** the next tick runs
- **THEN** its Kalman filter is reset and it no longer contributes to the solution

### Requirement: iBeacon ranging measurements are stabilized
WHEN CoreLocation ranges a layout beacon with negative RSSI and a finite positive accuracy, the iOS app SHALL clamp the accuracy to 0.35–11 m, SHALL move only 18 % toward the new value WHEN it differs from the previous value by more than 2.2 m, SHALL Kalman-filter the accepted value, SHALL blend it with the previous distance using alpha 0.28, and SHALL compute quality as `0.42 · signal + 0.38 · distance + 0.20 · proximity` with proximity weights immediate 1.0, near 0.8, far 0.28, unknown 0.05.

#### Scenario: Accuracy jumps from 2 m to 8 m
- **GIVEN** the previous accepted distance of a beacon is 2.0 m
- **WHEN** ranging reports 8.0 m
- **THEN** the accepted value before filtering is 3.08 m

### Requirement: Layout beacons are matched by identity with numeric fallback
The iOS app SHALL match a ranged or advertised iBeacon to a layout beacon by exact UUID, major, and minor. IF no exact match exists THEN the app SHALL match a layout beacon whose label ends with an integer equal to both major and minor, then equal to minor, then equal to major. WHEN a layout beacon lacks major or minor, the trailing integer of its label SHALL be used as default. Advertisements whose local name contains „Indooro“ SHALL additionally be recorded as samples under that name.

#### Scenario: Layout lacks major and minor
- **GIVEN** a layout beacon labeled „Beacon 3“ with UUID but no major/minor
- **WHEN** a beacon with that UUID, major 3, and minor 3 is ranged
- **THEN** the measurement is assigned to „Beacon 3“

### Requirement: Position solution combines solver and tracking confidence
WHEN at least three usable measurements exist, the iOS app SHALL solve the position by weighted Gauss-Newton trilateration with at most 10 iterations inside the layout bounds, SHALL use the refined point WHEN its residual is at most 0.05 m worse than the residual of the weighted centroid and the weighted centroid otherwise, and SHALL compute the final confidence as `0.45 · trackingConfidence + 0.55 · solverConfidence`, where tracking confidence weights beacon count 0.30, mean quality 0.30, freshness 0.20, and proximity 0.20, and solver confidence weights count, geometry, quality, and residual with 0.24, 0.28, 0.24, and 0.24.

#### Scenario: Only two beacons are fresh
- **GIVEN** two usable measurements
- **WHEN** a tick runs
- **THEN** no solved position is published and the confidence equals the tracking confidence

### Requirement: Navigation state machine governs route freezing
The iOS app SHALL run a navigation state machine with modes tracking, manual calibration, low confidence, and rerouting. WHEN confidence drops below 0.35, the machine SHALL enter low confidence, freeze the route, and publish „Signal schwach - Kalibrierung empfohlen“. WHEN confidence reaches 0.55 or more in low confidence, it SHALL return to tracking and unfreeze. WHEN a stable route deviation is detected and the route is not frozen, it SHALL enter rerouting and publish „Route wird stabil neu berechnet“. WHEN a manual position is set, it SHALL freeze the route, run the calibration, publish „Manuelle Kalibrierung aktiv“, and then return to tracking.

#### Scenario: Confidence recovers between thresholds
- **GIVEN** the machine is in low confidence
- **WHEN** confidence rises to 0.45
- **THEN** the machine stays in low confidence

### Requirement: Displayed position suppresses implausible jumps
The iOS app SHALL publish a new displayed position at most once per 1.0 s and only WHEN it moved at least 0.85 m or 3.0 s passed, SHALL exponentially smooth candidates with alpha 0.35, and SHALL hold a candidate that is farther than `2.5 m/s · elapsed + 0.85 m` from the stable point until three consecutive candidates within `max(0.5 m, 1.275 m)` of each other confirm the jump.

#### Scenario: Single outlier
- **GIVEN** the stable position is at 5 m / 5 m
- **WHEN** one candidate at 15 m / 5 m arrives followed by candidates near 5 m / 5 m
- **THEN** the displayed position never jumps to 15 m / 5 m

### Requirement: Manual calibration resets the pipeline at a walkable point
WHEN the customer sets the position manually or requests recalibration at the current estimate, the iOS app SHALL reset pose fusion and map-matching history to the given point, snap it to the nearest walkable edge, reset the display filter, rebuild the route from that point to the current destination, publish the snapped point as both raw and displayed position, clear the heading, and emit a manual calibration event with an increasing revision.

#### Scenario: Calibration during route guidance
- **GIVEN** a route to a shelf exists
- **WHEN** the customer calibrates at a new point
- **THEN** the route is rebuilt from the snapped point and the AR view receives the new calibration revision

### Requirement: Debug tracking mode disables radio positioning
WHEN tracking mode switches to „Debug (ohne Beacons)“, the iOS app SHALL stop iBeacon ranging, BLE scanning, and heading updates, SHALL clear all beacon measurements and buffers, SHALL disable „Tap setzt Ziel“, SHALL leave low confidence, and SHALL clear the status message. WHEN tracking mode switches back to „Beacon“, scanning and ranging SHALL be reconfigured.

#### Scenario: Demo without hardware
- **GIVEN** no beacons are installed
- **WHEN** the presenter selects the debug mode and taps the map
- **THEN** the tap calibrates the user position and routes can be demonstrated

### Requirement: Heading uses compass first and movement second
WHILE tracking mode is beacon and location is authorized, the iOS app SHALL receive compass headings with a 1-degree filter, SHALL map a true (or magnetic) bearing θ to map heading `π − θ` assuming the layout's negative y-axis points north, SHALL mark the heading reliable only WHILE compass accuracy is between 0 and 25 degrees, SHALL fall back to a movement heading derived from solved positions that moved more than 0.12 m within the last 1.4 s, SHALL smooth the displayed heading with alpha 0.24, and SHALL request the system calibration prompt WHEN compass accuracy is unknown or worse than 20 degrees.

#### Scenario: Compass is disturbed
- **GIVEN** compass accuracy is 40 degrees
- **WHEN** the heading is published
- **THEN** `isUserHeadingReliable` is false and the calibration prompt may be shown

### Requirement: Motion data drives short-term prediction
WHILE device motion is available, the iOS app SHALL sample device motion at 20 Hz, SHALL compute user-acceleration magnitude in g, and SHALL use it together with the recent movement heading to predict and map-match the pose between radio updates.

#### Scenario: Customer walks between ticks
- **GIVEN** a solved position exists and user acceleration exceeds the prediction threshold
- **WHEN** motion samples arrive between radio ticks
- **THEN** a predicted, map-matched position may be published subject to the display filter

### Requirement: Walkable graph is derived from the layout grid
WHEN a layout is applied, the iOS app SHALL build a one-meter grid graph over `gridWidth × gridHeight`, SHALL block every cell covered by `floor(x)…floor(x)+ceil(width)` and `floor(y)…floor(y)+ceil(height)` (minimum one cell) of every element except `beacon` and `entrance`, SHALL create a node at each free cell center, SHALL connect horizontally and vertically adjacent free nodes with cost 1, and SHALL find routes with A* using Euclidean distance between the nearest nodes to start and destination, prefixing the polyline with the start point and suffixing it with the destination.

#### Scenario: Destination is inside a shelf
- **GIVEN** the destination is a shelf center whose cells are blocked
- **WHEN** a route is requested
- **THEN** the route ends at the nearest free node and the polyline's last point is the shelf center

#### Scenario: No path exists
- **GIVEN** start and destination are in disconnected free areas
- **WHEN** a route is requested
- **THEN** no route is published and the route line is cleared

### Requirement: Product target resolves to the first matching shelf
WHEN a product becomes the navigation target, the iOS app SHALL split its layout code by „/“, SHALL select the first non-beacon layout element whose category starts with the first segment and whose meter equals the second segment WHEN the element defines a meter, SHALL use the element center as destination, and SHALL keep the previous target IF no element matches.

#### Scenario: Product with meter
- **GIVEN** elements with categories `520/1` and `520/2`
- **WHEN** a product with layout code `520/2/3/1` becomes the target
- **THEN** the destination is the center of the `520/2` element

### Requirement: Off-route rerouting is rate-limited
The iOS route manager SHALL treat the user as off-route only WHILE the matched position is more than 8.0 m from the route and an alternative edge scores at least 2.0 better, SHALL require this state for 6.0 s, SHALL wait at least 20 s between reroutes, SHALL require at least 5.0 m of movement since the last route start, and SHALL replace the route only WHEN the new route's cost or polyline length differs by at least 6.0 m or, for identical edges, a polyline point moved by at least 6.0 m. A route whose start and destination resolve to the same graph node SHALL be treated as no route.

#### Scenario: Short detour
- **GIVEN** the customer leaves the route for 4 seconds
- **WHEN** they return to it
- **THEN** no reroute is performed

