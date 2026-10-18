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

## MODIFIED Requirements

### Requirement: Customer web uses public catalog and layout APIs
The customer web experience SHALL use the public store list (`/api/mobile/stores`), the store's active layout (`/api/mobile/stores/{storeId}/layout/current`) and product search (`/api/products/search`) so anonymous users can search products and view the map. The search request SHALL include `storeCode` as soon as the store is known and SHALL omit the parameter otherwise.

#### Scenario: Anonymous customer searches
- **GIVEN** the customer page has loaded a store
- **WHEN** the customer enters a product query
- **THEN** the page calls product search with `storeCode` of that store without Keycloak login

#### Scenario: Customer map loads
- **GIVEN** the store has an active or default layout
- **WHEN** the customer page needs a map
- **THEN** it loads `/api/mobile/stores/{storeId}/layout/current` without Admin Platform authentication

## REMOVED Requirements

### Requirement: Customer web remains a compatibility surface
**Reason**: The customer web view now selects the store and consumes the store-specific layout; the legacy global layout flow is no longer used.
**Migration**: Use `?store=<storeCode>` links (QR codes) or the store list on `/customer/`.
