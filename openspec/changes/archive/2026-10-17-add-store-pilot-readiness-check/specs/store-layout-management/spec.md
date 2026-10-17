## ADDED Requirements

### Requirement: Store readiness report covers layout, products and beacons
The backend SHALL provide `GET /api/stores/{storeId}/readiness` for authenticated users with role `admin`, or `region-manager`/`store-manager` within their scope, and SHALL return HTTP 403 outside the scope and HTTP 401 without login. The report SHALL evaluate the store's active layout version and the store's products and SHALL list blocking errors (no active layout, not exactly one entrance, product whose `layoutCode` matches no shelf by exact category and meter, target shelf without label) and warnings (shelf without products, beacon assigned but not placed, more than 5 % of walkable cells with fewer than three placed beacons within the radius, grid size outside 5–200 units), each with the affected element or product id. The admin platform SHALL show the report on a page „Pilot-Bereitschaft“ per store with links to the affected editor element or product and an export as Markdown.

#### Scenario: Product points to a missing shelf
- **GIVEN** the active layout of store A has shelves `310/1` and `310/2` and product 42 has layoutCode `31/1/1/1`
- **WHEN** an admin opens „Pilot-Bereitschaft“ for store A
- **THEN** a blocking error names product 42 and its layoutCode, and the summary is red

#### Scenario: Ready store
- **GIVEN** store A has one entrance, labeled target shelves, all products matched and sufficient beacon coverage
- **WHEN** a store manager of store A opens the page
- **THEN** the summary is green and the Markdown export lists zero blocking errors

#### Scenario: Out-of-scope access
- **GIVEN** a store manager of store B
- **WHEN** they call `GET /api/stores/{A}/readiness`
- **THEN** the response is HTTP 403
