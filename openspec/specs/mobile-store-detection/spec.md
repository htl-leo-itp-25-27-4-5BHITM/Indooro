# mobile-store-detection Specification

## Purpose
Defines anonymous mobile store detection behavior, public mobile routes, active beacon identity exposure, beacon-based store lookup, manual fallback, and the MVP boundary against server-side customer tracking.
## Requirements
### Requirement: Mobile store routes stay anonymous
The system SHALL keep mobile store detection and mobile current-layout routes anonymous unless a future OpenSpec change explicitly protects them.

#### Scenario: Anonymous mobile client lists stores
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** an anonymous mobile client requests `/api/mobile/stores`
- **THEN** the system processes the request without redirecting to Keycloak

#### Scenario: Anonymous mobile client loads current layout
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** an anonymous mobile client requests `/api/mobile/stores/{storeId}/layout/current`
- **THEN** the system processes the request without requiring an Admin Platform session

### Requirement: Beacon identities route exposes active detection UUIDs
The system SHALL expose `GET /api/mobile/stores/beacon-identities` under `/api/mobile/stores` and return all active, non-archived beacon UUIDs relevant for mobile store detection.

#### Scenario: Active detection identities are requested
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** an anonymous mobile client requests `/api/mobile/stores/beacon-identities`
- **THEN** the response body contains a JSON object with a `uuids` array of beacon UUID strings

#### Scenario: Archived beacon exists
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** a beacon is archived or otherwise inactive
- **THEN** its UUID is not included in the `uuids` array

### Requirement: Mobile beacon UUIDs are normalized and deduplicated
The system SHALL return beacon UUIDs from mobile detection routes as normalized no-hyphen lowercase identifiers or as valid UUID strings and SHALL remove duplicate UUID values from mobile identity lists.

#### Scenario: Duplicate active identities exist
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** multiple records would produce the same mobile beacon UUID
- **THEN** `/api/mobile/stores/beacon-identities` returns that UUID only once

#### Scenario: UUID contains formatting differences
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** stored beacon UUIDs differ only by hyphens or case
- **THEN** the mobile identity response normalizes them to a stable comparable form

### Requirement: Beacon-based store lookup uses active assignments
The system SHALL resolve beacon-based store detection only through active, non-archived beacons and active store assignments.

#### Scenario: Mobile client sends known beacon
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** an anonymous mobile client requests store lookup by a beacon identity with an active store assignment
- **THEN** the system returns the matching store information needed for mobile context

#### Scenario: Beacon has no active assignment
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** a mobile client sends a beacon identity without an active store assignment
- **THEN** the system does not return a false store match

### Requirement: Manual store selection remains possible
The mobile experience SHALL support store search or selection flows that do not depend on BLE detection so customers can still search products and view maps when beacon detection fails. Store selection maps SHALL use real persisted store coordinates only.

#### Scenario: BLE signal is unavailable
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** a mobile device cannot detect a usable beacon signal
- **THEN** the mobile client can still use public store listing or search flows to choose a store

#### Scenario: Store is selected manually
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** a customer manually selects a store
- **THEN** product search and current layout retrieval can proceed for that store

#### Scenario: Store map uses persisted coordinates
- **GIVEN** active stores have persisted latitude and longitude values
- **WHEN** the mobile store map renders store pins
- **THEN** the pins are placed at those persisted coordinates without city-based or deterministic-offset fallback

#### Scenario: Store has no coordinates
- **GIVEN** an active store lacks latitude or longitude
- **WHEN** the mobile store map renders
- **THEN** that store is omitted from the map or handled as a non-production debug case instead of being shown at a fake coordinate

### Requirement: Customer position is not stored server-side for MVP
The system SHALL NOT require server-side storage of anonymous customer positions for MVP store detection, search, map display, or routing.

#### Scenario: Mobile client calculates local route
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** the mobile app calculates or displays a route
- **THEN** the backend is not required to persist the customer's live position

#### Scenario: Detection request is processed
- **GIVEN** active store, beacon, and assignment data are available as described
- **WHEN** the mobile client performs beacon-based store lookup
- **THEN** the request can be handled without creating a customer identity profile

### Requirement: Beacon store lookup accepts UUID and optional major/minor
The mobile store lookup route SHALL accept beacon identity input with UUID and optional major/minor query parameters and resolve it against active beacon assignments.

#### Scenario: Full beacon identity is sent
- **GIVEN** a beacon with UUID, major, and minor is active and assigned to an active store
- **WHEN** an anonymous mobile client requests `/api/mobile/stores/by-beacon` with matching query parameters
- **THEN** the backend returns the matched store context and matched beacon information

#### Scenario: UUID-only identity is sent
- **GIVEN** a beacon identity is configured without major/minor
- **WHEN** a mobile client sends only the UUID query parameter
- **THEN** the backend can resolve it if the stored identity and active assignment match UUID-only semantics

### Requirement: Mobile store list includes active stores only
The mobile store listing route SHALL expose stores that are active and suitable for anonymous customer selection, including address and coordinate fields needed by the mobile store map.

#### Scenario: Active stores are requested
- **GIVEN** active and archived stores exist
- **WHEN** an anonymous mobile client requests `/api/mobile/stores`
- **THEN** the response includes active selectable stores and excludes archived stores

#### Scenario: Store has no active layout
- **GIVEN** a store is active but lacks active/current layout data
- **WHEN** it appears in mobile selection flows
- **THEN** clients must still handle missing layout as a separate no-layout state

#### Scenario: Store coordinates are returned
- **GIVEN** an active store has latitude and longitude
- **WHEN** an anonymous mobile client requests `/api/mobile/stores`
- **THEN** the response includes `address`, `latitude`, and `longitude` for that store

### Requirement: Mobile store detection does not require exact customer position
Beacon-based store detection SHALL identify the active store context and SHALL NOT require computing or uploading the customer's exact indoor coordinates.

#### Scenario: Beacon resolves store
- **GIVEN** the mobile app detects a beacon assigned to a store
- **WHEN** it calls the store lookup route
- **THEN** the backend returns store context without storing the customer's position

#### Scenario: Exact positioning is needed
- **GIVEN** the app needs Blue Dot positioning within a store
- **WHEN** it computes customer position
- **THEN** the computation remains a mobile positioning/navigation concern rather than a store-detection API requirement

### Requirement: iOS refreshes store-detection beacon identities
The iOS app SHALL request `GET /mobile/stores/beacon-identities` once during start-up and afterwards at most every 60 seconds from the positioning tick, SHALL never run two identity requests in parallel, SHALL accept the identities as a bare string array, an array of objects with `uuid` or `identityKey`, or an object with `uuids`, `beacons`, or `identities`, SHALL normalize them to UUIDs, and SHALL rebuild the iBeacon ranging constraints only WHEN the non-empty identity set changed.

#### Scenario: Identity list unchanged
- **GIVEN** the identity set equals the current ranging identity set
- **WHEN** the 60-second refresh completes
- **THEN** ranging constraints are not restarted

#### Scenario: Identity list empty
- **GIVEN** the backend returns `{ "uuids": [] }`
- **WHEN** the refresh completes
- **THEN** the previous identity set is kept and „Store-Beacon-Identities leer“ is logged

### Requirement: iOS ranging constraints combine layout and detection identities
The iOS app SHALL range one `CLBeaconIdentityConstraint` per distinct UUID/major pair of the active layout beacons and one UUID-only constraint per store-detection UUID, SHALL drop UUID/major constraints whose UUID is already covered by a UUID-only constraint, SHALL sort constraints deterministically, and SHALL stop all previously active constraints before starting the new set. Ranging SHALL only run WHILE tracking mode is beacon, location is authorized, and at least one constraint exists.

#### Scenario: Layout and detection share a UUID
- **GIVEN** the layout contains UUID U with major 1 and detection identities contain U
- **WHEN** constraints are built
- **THEN** only the UUID-only constraint for U is ranged

#### Scenario: Ranging fails
- **GIVEN** CoreLocation reports a ranging failure
- **WHEN** no other status message is shown
- **THEN** the app publishes „iBeacon-Ranging fehlgeschlagen: <error>“

### Requirement: iOS store lookup is de-duplicated and throttled
WHEN an iBeacon is ranged or its manufacturer data (Apple company id `0x004C`, type `0x02`, length `0x15`) is advertised with RSSI of at least −95 dBm, the iOS app SHALL look up the store with `GET /mobile/stores/by-beacon?uuid=<32 lowercase hex>&major=<n>&minor=<n>` unless a lookup for the same UUID is pending, the UUID already identifies the active detected store, or a lookup for the same UUID failed less than 15 seconds ago. Ranged beacons with non-negative RSSI SHALL be treated as −95 dBm for this decision.

#### Scenario: Weak advertisement
- **GIVEN** an iBeacon advertisement with RSSI −97 dBm
- **WHEN** it is received
- **THEN** no store lookup is sent

#### Scenario: Repeated ranging of the active store beacon
- **GIVEN** store S was detected through UUID U
- **WHEN** U is ranged again
- **THEN** no new lookup is sent

### Requirement: iOS applies store lookup results to the layout
WHEN a store lookup returns HTTP 2xx with a decodable body, the iOS app SHALL set the detected store and active identity, clear the failure cooldown, and load the store's current layout with activation source beacon unless that store's layout is already active in current-server mode. WHEN the lookup returns HTTP 404, the app SHALL record the failure time, clear the detected store, and load the default server layout IF current-server mode is selected. Other failures SHALL only be logged.

#### Scenario: Beacon of a new store
- **GIVEN** the active layout belongs to store A
- **WHEN** a lookup resolves store B
- **THEN** store B's current layout is loaded and the map tab switches to the indoor view

#### Scenario: Unknown beacon
- **GIVEN** the backend returns 404 for a UUID
- **WHEN** the response is processed
- **THEN** the detected store is cleared and the same UUID is not looked up again for 15 seconds

### Requirement: iOS store layout failures keep the store context visible
WHEN loading a detected or selected store layout fails, the iOS app SHALL stop the loading state, clear the active layout store, set the layout description to „<store> erkannt • Layout nicht geladen: <reason>“, publish „Store erkannt, Layout konnte nicht geladen werden.“, and start the 15-second lookup cooldown for the detecting identity. The status message SHALL be cleared WHEN any layout is applied successfully.

#### Scenario: Store layout returns 500
- **GIVEN** store „EUROSPAR Leonding/Hart“ was detected
- **WHEN** its layout request fails with HTTP 500
- **THEN** the map header shows „EUROSPAR Leonding/Hart erkannt • Layout nicht geladen: Der Server antwortete mit Status 500.“

### Requirement: iOS app consumes beacon-based store lookup
The iOS app SHALL use the public mobile beacon lookup API to resolve the active store when automatic beacon-based store detection is enabled, and SHALL fall back to manual store selection when lookup is unavailable, ambiguous, or denied by backend validation.

#### Scenario: Beacon detection resolves a store
- **GIVEN** the iOS app detects a beacon identity with UUID and optional major/minor values
- **WHEN** automatic store detection is active
- **THEN** the app calls `/api/mobile/stores/by-beacon` with the detected identity and loads `/api/mobile/stores/{storeId}/layout/current` for the returned store

#### Scenario: Beacon lookup is ambiguous
- **GIVEN** the backend returns a conflict or no usable store match for a detected beacon identity
- **WHEN** the iOS app handles the lookup result
- **THEN** it keeps the current store context or asks the customer to choose a store manually instead of switching to a guessed store

#### Scenario: Manual selection remains available
- **GIVEN** automatic beacon lookup fails or Bluetooth is unavailable
- **WHEN** the customer opens store selection
- **THEN** the app can load active stores from `/api/mobile/stores` and continue with a manually selected store

