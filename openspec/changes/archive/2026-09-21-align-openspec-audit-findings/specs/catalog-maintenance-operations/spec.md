## RENAMED Requirements

- FROM: `### Requirement: Category maintenance supports lookup and bulk import`
- TO: `### Requirement: Category maintenance supports lookup and protected bulk import`

## MODIFIED Requirements

### Requirement: Category maintenance supports lookup and protected bulk import
The backend SHALL support public category listing and category-code lookup, and SHALL protect bulk category indexing as an admin-only catalog maintenance write path.

#### Scenario: Category code is requested
- **GIVEN** a category has been indexed
- **WHEN** an anonymous or authenticated client calls `GET /api/categories/{categoryCode}`
- **THEN** the backend returns the category or a not-found response without requiring Admin Platform login

#### Scenario: Categories are bulk imported
- **GIVEN** an authenticated `admin` with an active Indooro access assignment supplies a JSON array of category objects
- **WHEN** the client calls `POST /api/categories/bulk`
- **THEN** the backend indexes the categories and reports the count

#### Scenario: Non-admin attempts category bulk import
- **GIVEN** Keycloak authentication and Indooro access assignments are configured
- **WHEN** an anonymous user, `region-manager`, or `store-manager` calls `POST /api/categories/bulk`
- **THEN** the backend rejects the mutation without changing category catalog data
