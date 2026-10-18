# customer-web-experience Specification

## Purpose
Defines the hosted anonymous customer web experience under `/customer/`, including public product search, legacy layout compatibility, deployment surface, and boundaries against customer accounts or analytics.
## Requirements
### Requirement: Customer web view is hosted by the backend
The system SHALL serve the customer web experience from the Quarkus backend under `/customer/` alongside the Admin Platform and landing page.

#### Scenario: Customer opens hosted page
- **GIVEN** the backend is running with static resources enabled
- **WHEN** a customer opens `/customer/`
- **THEN** the backend serves the customer web page without requiring Admin Platform login

#### Scenario: Customer route is deployed to LeoCloud
- **GIVEN** the LeoCloud ingress routes `/` to the backend service
- **WHEN** the customer web path is requested on the public host
- **THEN** the page is reachable through the same public host as the backend APIs

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

### Requirement: Customer web does not create customer accounts
The customer web experience SHALL remain anonymous and SHALL NOT create customer profiles, payment flows, analytics tracking, or server-side live position storage as baseline behavior.

#### Scenario: Anonymous web user opens customer view
- **GIVEN** a user opens the customer page
- **WHEN** they search or view a layout
- **THEN** the system does not require registration or login

#### Scenario: Analytics is requested
- **GIVEN** a future change proposes customer analytics or behavior tracking
- **WHEN** the change is proposed
- **THEN** it must define consent, data retention, and privacy requirements before implementation

### Requirement: Web product finder works per store from a QR link
The customer web view SHALL accept `?store=<storeCode>` and optional `&a=<anchorId>`, SHALL load that store's active layout through the public mobile API, SHALL search products of that store, SHALL show each result's location in customer words (shelf label, board from the bottom, position) and highlight the shelf on an SVG map, SHALL let the customer build a list ordered by walking distance from the entrance or from the scanned anchor, and SHALL NOT set cookies or send analytics.

#### Scenario: Android customer at the entrance
- **GIVEN** the entrance QR code links to `/customer/?store=SPAR-Leonding-001&a=E1`
- **WHEN** an Android user scans it and searches „Backpulver“
- **THEN** the result shows „Gang 4 · links · Backzutaten“ and the shelf is highlighted on the map

#### Scenario: Unknown store
- **WHEN** the link contains an unknown store code
- **THEN** the page shows the store list instead of an error

