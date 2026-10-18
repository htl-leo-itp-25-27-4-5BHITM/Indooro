## ADDED Requirements

### Requirement: Arrival is suggested, never assumed
WHILE positioning is „Mit Ortung“ and the position is trusted, the app SHALL suggest completing the active stop with „Bist du bei <Regal>?“ when the position stays within the configured radius of the stop for the configured dwell time. The app SHALL complete the stop only after the customer confirms, SHALL suppress the suggestion for 30 seconds after „Noch nicht“, and SHALL never suggest while the position is not trusted.

#### Scenario: Standing at the shelf
- **GIVEN** a trusted position within 3 m of the active stop for 6 seconds
- **WHEN** the dwell time of 5 seconds has passed
- **THEN** the suggestion appears and the stop stays open until the customer taps „Ja, erledigt“
