## ADDED Requirements

### Requirement: Customer-facing views meet an accessibility baseline
Customer-facing views SHALL scale with Dynamic Type without truncating essential text, SHALL provide VoiceOver labels for all interactive elements and a summary element for the map stating the target location, distance and route origin, SHALL use tap targets of at least 44 × 44 pt, and SHALL keep text contrast of at least 4.5:1.

#### Scenario: Largest text size
- **GIVEN** the system text size is set to the largest accessibility size
- **WHEN** the customer opens a search result
- **THEN** the shelf location text is fully readable without truncation

#### Scenario: VoiceOver on the map
- **WHEN** VoiceOver focuses the map during a tour
- **THEN** it reads the active stop's shelf text, the remaining distance and the route origin
