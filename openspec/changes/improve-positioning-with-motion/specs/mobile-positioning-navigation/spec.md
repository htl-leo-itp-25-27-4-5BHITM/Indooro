## ADDED Requirements

### Requirement: Motion-aided estimation is enabled only with replay evidence
The iOS positioning pipeline MAY use step events and device heading to damp updates while standing and to predict displacement while walking. This mode SHALL be disabled by default and SHALL be enabled only when replays of all committed real recordings show at least 20 % lower 95th-percentile lag and at least 20 % shorter standing path length than the current estimator, with no increase in reroutes per tour; the comparison SHALL be documented in `NavigationFixtures/BASELINE.md`.

#### Scenario: Evidence missing
- **GIVEN** fewer than five real recordings exist
- **WHEN** someone proposes enabling motion-aided estimation
- **THEN** the flag stays off

### Requirement: DEBUG recordings carry step and heading data
The DEBUG recorder SHALL write device steps and compass heading as additional JSON Lines entries (`step`, `heading`) next to the existing entries, without changing the existing entries. The recorder SHALL request the motion permission only while recording, and SHALL continue with beacon data only when the permission is denied or step counting is unavailable. Readers SHALL skip entries of unknown type, and replays with motion-aided estimation disabled SHALL produce the same metrics with and without step and heading entries.

#### Scenario: Permission denied
- **GIVEN** the user denied „Bewegung & Fitness“
- **WHEN** a recording is started
- **THEN** the file contains measurement, layout, event and heading entries and no step entries, and recording does not fail

#### Scenario: Old recording replayed
- **GIVEN** a recording without step and heading entries
- **WHEN** it is replayed with motion-aided estimation disabled or enabled
- **THEN** the metrics are identical in both cases
