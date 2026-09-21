## MODIFIED Requirements

### Requirement: iOS store layout failures keep the store context visible
WHEN loading a detected or selected store layout fails and no cached layout exists for that store, the iOS app SHALL stop the loading state, clear the active layout store, set the layout description to „<store> erkannt • Layout nicht geladen: <reason>“, publish „Store erkannt, Layout konnte nicht geladen werden.“, and start the 15-second lookup cooldown for the detecting identity. WHEN a cached layout exists for that store, the app SHALL apply it, keep the store as active layout store, and still start the cooldown. The status message SHALL be cleared WHEN any layout is applied successfully from the server.

#### Scenario: Store layout returns 500
- **GIVEN** store „EUROSPAR Leonding/Hart“ was detected and no cached layout exists
- **WHEN** its layout request fails with HTTP 500
- **THEN** the map header shows „EUROSPAR Leonding/Hart erkannt • Layout nicht geladen: Der Server antwortete mit Status 500.“

#### Scenario: Store layout fails with cache
- **GIVEN** store „EUROSPAR Leonding/Hart“ has a cached layout
- **WHEN** its layout request fails
- **THEN** the cached layout is shown as offline copy and the store remains the active layout store
