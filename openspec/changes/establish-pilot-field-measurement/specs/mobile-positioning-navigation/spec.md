## ADDED Requirements

### Requirement: Positioning parameter changes require recorded evidence
A change to any positioning or navigation parameter marked provisional SHALL be accompanied by at least two real recordings from the site the change targets, by before/after replay metrics documented in `NavigationFixtures/BASELINE.md`, and by passing synthetic replay tests. Parameters without this evidence SHALL keep their `// provisional` marker.

#### Scenario: Off-route threshold change
- **GIVEN** a proposal to change the off-route distance from 4.0 m to 6.0 m
- **WHEN** it is reviewed
- **THEN** it includes two recordings, before/after metrics for reroutes per tour and off-route delay, and green synthetic tests, or it is rejected

### Requirement: Field recordings are anonymized replay fixtures
Real recordings committed to the repository SHALL contain no device identifiers, no names of test persons and no free-text notes about persons, SHALL be stored under `swift/indooro-EinkaeuferFinal/NavigationFixtures/recordings/`, and SHALL each be covered by a replay test that asserts the documented metrics within tolerances.

#### Scenario: Committing a recording
- **GIVEN** a recording shared from a test iPhone
- **WHEN** it is added as a fixture
- **THEN** an anonymization check passes and a replay test reproduces the metrics in its report

### Requirement: One recorded walk is analysable with a single command
A DEBUG recording of one walk SHALL be analysable on the Mac with one command that anonymizes a copy, replays it through the unchanged positioning pipeline with the committed default configuration, and writes a report with the replay metrics, the position error per truth marker, the projected-position jumps and the number of audible beacons per truth position. The DEBUG recorder SHALL give feedback for every truth marker and SHALL record iBeacons that match no beacon of the active layout as `scan` entries (major, minor, RSSI, no UUID) that the replay ignores. Reports from synthetic recordings SHALL be labelled as synthetic and SHALL NOT be cited as field results.

#### Scenario: Registration does not match the layout
- **GIVEN** a recording in which one layout beacon never appears and a foreign major/minor does
- **WHEN** the walk is analysed
- **THEN** the report lists the silent layout beacon and the unmatched major/minor instead of silently showing fewer beacons

#### Scenario: Synthetic dry run
- **GIVEN** a recording whose file name starts with `synthetic-`
- **WHEN** it is analysed
- **THEN** the report starts with a banner stating that it is not a measurement
