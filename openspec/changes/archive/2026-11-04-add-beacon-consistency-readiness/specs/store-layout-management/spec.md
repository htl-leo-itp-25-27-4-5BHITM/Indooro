## ADDED Requirements

### Requirement: Readiness report checks beacon registry consistency
The store readiness report SHALL compare the beacons registered for the store (table `beacons`, the source of `GET /api/mobile/stores/beacon-identities`) with the beacon elements of the active layout by uuid, major and minor, ignoring case and dashes. It SHALL report as blocking findings: a registered or layout beacon with an all-zero UUID (`BEACON_UUID_ALL_ZERO`), a registered beacon without major or minor (`BEACON_MAJOR_MINOR_MISSING`), two beacons of the store with the same uuid, major and minor (`BEACON_IDENTITY_DUPLICATE`), a layout beacon linked to a registered beacon whose identity differs (`BEACON_IDENTITY_MISMATCH`) and a layout beacon without a registered beacon of the same identity (`LAYOUT_BEACON_NOT_REGISTERED`). A registered beacon that is not placed in the layout SHALL stay a warning. The admin readiness page SHALL show the number of deviations, or state that there are no beacons to compare instead of calling the store consistent.

#### Scenario: Zero UUID in the registry
- **GIVEN** a registered beacon `Indooro5` with UUID `00000000000000000000000000000000`
- **WHEN** the readiness report is evaluated
- **THEN** it contains a blocking finding `BEACON_UUID_ALL_ZERO` with beacon code `Indooro5` and the status is RED

#### Scenario: Layout and registry disagree
- **GIVEN** a layout beacon with identity `…:1:17` linked by code to a registered beacon with identity `…:1:15`
- **WHEN** the readiness report is evaluated
- **THEN** it contains a blocking finding `BEACON_IDENTITY_MISMATCH` for that layout element

#### Scenario: Store without beacons
- **GIVEN** no registered and no placed beacons
- **WHEN** the admin readiness page renders the report
- **THEN** it shows "Keine Beacons zum Vergleichen" and not "stimmen überein"
