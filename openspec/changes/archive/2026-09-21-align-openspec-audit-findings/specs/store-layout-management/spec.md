## MODIFIED Requirements

### Requirement: Mobile current-layout route is public
The system SHALL expose the current layout needed by the mobile customer experience through a public mobile route unless a future OpenSpec change explicitly changes that route boundary. When no active store layout exists, the route SHALL return a distinguishable fallback/default layout response rather than presenting it as a persisted active layout.

#### Scenario: Anonymous mobile client opens map
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** an anonymous mobile client requests `/api/mobile/stores/{storeId}/layout/current`
- **THEN** the backend returns the active layout for that store without requiring admin login

#### Scenario: Store has no active layout
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a mobile client requests the current layout for a store without an active layout
- **THEN** the system returns an explicit fallback/default layout response with no persisted layout id so the client does not mistake it for an active saved layout

#### Scenario: Client displays fallback layout
- **GIVEN** a mobile layout response has no persisted layout id or is otherwise marked as fallback/default
- **WHEN** the mobile client renders the map
- **THEN** the client can show fallback/debug context while still keeping map display usable
