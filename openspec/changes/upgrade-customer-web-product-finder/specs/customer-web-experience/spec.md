## ADDED Requirements

### Requirement: Web product finder works per store from a QR link
The customer web view SHALL accept `?store=<storeCode>` and optional `&a=<anchorId>`, SHALL load that store's active layout through the public mobile API, SHALL search products of that store, SHALL show each result's location in customer words (shelf label, board from the bottom, position) and highlight the shelf on an SVG map, SHALL let the customer build a list ordered by walking distance from the entrance or from the scanned anchor, and SHALL NOT set cookies or send analytics.

#### Scenario: Android customer at the entrance
- **GIVEN** the entrance QR code links to `/customer/?store=SPAR-Leonding-001&a=E1`
- **WHEN** an Android user scans it and searches „Backpulver“
- **THEN** the result shows „Gang 4 · links · Backzutaten“ and the shelf is highlighted on the map

#### Scenario: Unknown store
- **WHEN** the link contains an unknown store code
- **THEN** the page shows the store list instead of an error
