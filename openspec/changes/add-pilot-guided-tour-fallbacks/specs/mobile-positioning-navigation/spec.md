## ADDED Requirements

### Requirement: Tour route has an origin without a trusted position
WHILE a shopping tour or single target is active and no trusted projected position exists, the navigation session SHALL build the route to the active stop from a fallback origin: the walkable point of the last completed or skipped stop if one exists in the current tour, otherwise the walkable point of the first layout element of type `entrance`. A trusted projected position SHALL replace the fallback origin as soon as it is available, and the fallback origin SHALL NOT be used again until the trusted position is lost. A position is trusted WHEN tracking uses beacons, confidence is not low and at least three fresh beacon measurements exist, or WHEN the customer has set the position manually and no newer confident solver update exists. WHEN the layout has no entrance and no stop was completed, the session SHALL keep the current behavior and draw no route.

#### Scenario: Tour start without beacons
- **GIVEN** a layout with one entrance and a planned tour with three stops
- **AND** no trusted position exists
- **WHEN** the tour starts
- **THEN** the route to the first stop starts at the entrance's walkable point

#### Scenario: Stop completed without beacons
- **GIVEN** an active tour without a trusted position and the active stop „Backzutaten“
- **WHEN** the customer taps „Erledigt“
- **THEN** the route to the next stop starts at the walkable point of „Backzutaten“

#### Scenario: Trusted position arrives
- **GIVEN** a route that starts at the entrance as fallback origin
- **WHEN** a trusted projected position arrives
- **THEN** the route is rebuilt once from the trusted position and the fallback origin is no longer used

#### Scenario: Layout without entrance
- **GIVEN** a layout without an `entrance` element and no completed stop
- **WHEN** a tour starts without a trusted position
- **THEN** no route is drawn and no error is raised
