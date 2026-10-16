## ADDED Requirements

### Requirement: Motion-aided estimation is enabled only with replay evidence
The iOS positioning pipeline MAY use step events and device heading to damp updates while standing and to predict displacement while walking. This mode SHALL be disabled by default and SHALL be enabled only when replays of all committed real recordings show at least 20 % lower 95th-percentile lag and at least 20 % shorter standing path length than the current estimator, with no increase in reroutes per tour; the comparison SHALL be documented in `NavigationFixtures/BASELINE.md`.

#### Scenario: Evidence missing
- **GIVEN** fewer than five real recordings exist
- **WHEN** someone proposes enabling motion-aided estimation
- **THEN** the flag stays off
