## MODIFIED Requirements

### Requirement: Public routes stay public
The system SHALL keep anonymous customer/mobile routes accessible without Admin Platform login, including all methods on `/api/mobile/*` (among them `/api/mobile/stores`, `/api/mobile/stores/by-beacon`, `/api/mobile/stores/beacon-identities`, `/api/mobile/stores/{storeId}/layout/current`, `/api/mobile/recipes/*`, and `/api/mobile/upsell/*`), and `GET` requests on `/api/products`, `/api/products/*`, `/api/categories`, `/api/categories/*`, `/api/layout`, and `/api/layout/*`, unless a future OpenSpec change explicitly changes the boundary. Non-`GET` requests on `/api/products*`, `/api/categories*`, and `/api/layout*` SHALL NOT be anonymous.

#### Scenario: Anonymous mobile store lookup
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an anonymous mobile client requests `/api/mobile/stores/by-beacon`
- **THEN** the system processes the request without redirecting to Keycloak

#### Scenario: Anonymous mobile beacon identities lookup
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an anonymous mobile client requests `/api/mobile/stores/beacon-identities`
- **THEN** the system processes the request without requiring an admin session

#### Scenario: Anonymous catalog lookup
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an anonymous client requests `/api/products`
- **THEN** the system processes the request without requiring an admin session

#### Scenario: Anonymous legacy layout write
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an anonymous client sends `POST /api/layout/current`
- **THEN** the system responds with HTTP 401 and the stored default layout is unchanged

#### Scenario: Anonymous upsell plan
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an anonymous iOS client sends `POST /api/mobile/upsell/plan`
- **THEN** the system processes the request without requiring an admin session
