## ADDED Requirements

### Requirement: Beacons use one documented identity scheme
Every Indooro beacon used in a test site or pilot store SHALL advertise the single project iBeacon UUID documented in `docs/pilot-readiness/hardware/BEACON_STANDARD.md`, SHALL use the site number as major and a unique beacon number as minor, and SHALL carry a physical label with its minor. Layouts used for positioning SHALL NOT contain the placeholder UUID consisting only of zeros.

#### Scenario: New beacon is prepared
- **GIVEN** a new beacon for the pilot store with site number 10
- **WHEN** it is configured
- **THEN** it advertises the project UUID, major 10 and the next free minor, and its label shows that minor

#### Scenario: Placeholder UUID is rejected in review
- **GIVEN** a layout JSON with a beacon whose UUID is all zeros
- **WHEN** it is proposed for a measurement session
- **THEN** the session checklist fails until real identities are entered

### Requirement: Beacon configuration is recorded per site
Each site SHALL have a configuration record listing for every beacon its minor, major, coordinates in layout meters, mounting height, mounting place, TX power, advertising interval and battery date. The coordinates in the layout SHALL match the measured mounting position within 0.5 m.

#### Scenario: Coordinate check
- **GIVEN** beacon minor 3 recorded at x 12.0 m, y 4.5 m
- **WHEN** the mounting position is re-measured
- **THEN** the difference is at most 0.5 m or the record and layout are corrected

### Requirement: Field measurements follow a fixed protocol and produce a report
A field measurement session SHALL use floor markers with known coordinates, SHALL record stationary periods of at least 60 s at no fewer than four markers, at least one walking loop passing all markers, one deliberate wrong-aisle walk and one walk past two nearly equidistant stops, with at least two iPhone models. Each session SHALL produce a report with median and 90th-percentile position error at markers, the share of walking time in the correct aisle, reroutes per tour, active-stop changes without event, off-route detection delay, and battery drop over 30 minutes.

#### Scenario: Session report
- **GIVEN** a completed measurement session in the test room
- **WHEN** the recordings are replayed
- **THEN** a report in `docs/pilot-readiness/hardware/reports/` contains all listed metrics and links the fixture files
