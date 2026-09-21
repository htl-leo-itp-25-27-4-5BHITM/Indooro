## ADDED Requirements

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
