## ADDED Requirements

### Requirement: Audit entries identify the acting user
The backend SHALL store the acting user's Indooro role, username, and Keycloak subject in every audit entry and in `created_by_role`/`created_by_label` of layout versions and recipes when the request is authenticated, and SHALL store `SYSTEM` only for mutations without an authenticated identity.

#### Scenario: A region manager archives a store
- **GIVEN** user `indooro-region` with role `region-manager` and subject `2222…`
- **WHEN** the user archives a store in the assigned region
- **THEN** the audit entry has actor role `region-manager`, actor label `indooro-region`, and actor subject `2222…`

#### Scenario: A layout version is saved by a store manager
- **GIVEN** user `indooro-store` with role `store-manager`
- **WHEN** the user saves a layout version
- **THEN** the version has `created_by_role` `store-manager` and `created_by_label` `indooro-store`

### Requirement: Catalog and tag mutations are audited
The backend SHALL write audit entries for recipe tag creation, update, and archiving (entity type `RECIPE_TAG`), for admin product upserts and deletions (entity type `PRODUCT`), and for category upserts and bulk imports (entity type `CATEGORY`), including the numeric product id or category code in the summary.

#### Scenario: An admin deletes a product
- **GIVEN** product 101 exists
- **WHEN** an admin calls `DELETE /api/admin/products/101`
- **THEN** an audit entry with entity type `PRODUCT`, action `DELETE`, and a summary containing `101` exists

#### Scenario: An admin archives a recipe tag
- **GIVEN** an active recipe tag `vegan`
- **WHEN** an admin archives it
- **THEN** an audit entry with entity type `RECIPE_TAG` and action `ARCHIVE` exists

### Requirement: Error persistence is bounded
The backend SHALL persist every 5xx error and SHALL persist 4xx errors only for authenticated admin requests. Anonymous 4xx errors SHALL NOT create `error_logs` rows. The backend SHALL delete `error_logs` rows older than 30 days at least daily and SHALL keep at most 50 000 rows.

#### Scenario: Anonymous clients probe unknown beacons
- **GIVEN** an anonymous client
- **WHEN** it sends 1 000 requests to `/api/mobile/stores/by-beacon` that end with 404
- **THEN** no `error_logs` rows are created for these requests

#### Scenario: Retention runs
- **GIVEN** error log rows older than 30 days
- **WHEN** the daily cleanup job runs
- **THEN** those rows are deleted

### Requirement: Server errors do not reveal internals
For 5xx responses the backend SHALL return the message „Interner Serverfehler“ together with a `correlationId` and SHALL store the original exception message and stack trace only in `error_logs` under the same correlation id. A failure while persisting the error SHALL NOT change the response.

#### Scenario: A database constraint fails unexpectedly
- **GIVEN** a unique constraint violation that is not translated into 409
- **WHEN** the error is mapped
- **THEN** the response body contains `"error":"Interner Serverfehler"` and a `correlationId`, and no SQL or constraint name

#### Scenario: The error table is unavailable
- **GIVEN** the database rejects the error log insert
- **WHEN** a 500 is mapped
- **THEN** the client still receives the 500 response body

### Requirement: Web responses carry security headers
The backend SHALL send `Content-Security-Policy` with `default-src 'self'`, `script-src 'self'`, and `frame-ancestors 'none'`, plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`, for `/`, `/admin/*`, and `/customer/*`, and SHALL send `Strict-Transport-Security` in the production profile.

#### Scenario: The admin page is loaded
- **GIVEN** the production profile
- **WHEN** the browser loads `/admin/`
- **THEN** the response includes the Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy`, and `Strict-Transport-Security` headers

#### Scenario: A page tries to frame the admin UI
- **GIVEN** a third-party site embeds `/admin/` in an iframe
- **WHEN** the browser evaluates the response
- **THEN** the frame is blocked by `frame-ancestors 'none'`

### Requirement: PDF utility inputs are bounded
The PDF export SHALL reject requests with more than 2 000 products, with product names longer than 200 characters, or with layout codes whose level or position is outside 1 to 50 or whose meter is outside 1 to 999, and SHALL replace characters the PDF font cannot encode instead of failing. The PDF import SHALL reject files larger than 10 MB or with more than 50 pages and SHALL parse numeric groups with bounded length.

#### Scenario: An oversized shelf level is submitted
- **GIVEN** a product with `layoutCode` `1/1/2000000000/1`
- **WHEN** it is posted to `/api/export/pdf`
- **THEN** the backend responds 400 within one second without rendering

#### Scenario: A product name contains an emoji
- **GIVEN** a product named `Apfel 🍎`
- **WHEN** the PDF is exported
- **THEN** the PDF is generated and the unsupported character is replaced

### Requirement: Layout documents are validated before storage
The backend SHALL reject layout documents for `POST /api/layout/current` and `POST /api/stores/{storeId}/layout/versions` that exceed 1 MB serialized, contain more than 5 000 elements, contain non-numeric `x`, `y`, `width`, `height`, or `rotation` values, or contain `label`, `beaconId`, or `category` strings longer than 200 characters.

#### Scenario: A layout with 10 000 elements is saved
- **GIVEN** a layout document with 10 000 elements
- **WHEN** it is saved
- **THEN** the backend responds 400 and stores nothing

#### Scenario: A valid layout is saved
- **GIVEN** a layout with 120 elements and short labels
- **WHEN** it is saved by an authorized user
- **THEN** the layout is stored unchanged

### Requirement: Anonymous cost-bearing routes are throttled
The backend SHALL limit `POST /api/mobile/upsell/plan` and `POST /api/mobile/upsell/suggestions` to 20 requests per client address per 10 minutes, `POST /api/mobile/upsell/events` and `POST /api/mobile/upsell/dismiss` to 120 requests per client address per 10 minutes, and `/api/export/*` and `/api/convert/*` to 10 requests per client address per minute, and SHALL answer excess requests with 429 and `Retry-After` (the limits match `modernize-ios-client-architecture`, which defines the iOS handling of 429). Upsell plan requests SHALL validate nested opportunities, SHALL accept at most 30 opportunities, and SHALL accept at most 200 ids in `currentListProductIds` and `completedProductIds`.

#### Scenario: A client floods the plan route
- **GIVEN** one client address
- **WHEN** it sends 21 plan requests within 10 minutes
- **THEN** the 21st request receives 429 with `Retry-After` and triggers no catalog or OpenAI calls

#### Scenario: An opportunity has a blank id
- **GIVEN** a plan request whose first opportunity has `opportunityId` `""`
- **WHEN** the request is validated
- **THEN** the backend responds 400

### Requirement: Upsell cost diagnostics are admin-only
For requests that are not authenticated with role `admin`, the backend SHALL limit the upsell plan `debug` object to `requestId`, `responseSource`, `fallbackReason`, and a retryability flag, and SHALL omit the model name, token counts, latencies, and candidate counts. Requests authenticated with role `admin` SHALL receive the full diagnostics.

#### Scenario: The iOS client requests a plan
- **GIVEN** an anonymous request
- **WHEN** the plan response is returned
- **THEN** `debug` contains at most `requestId`, `responseSource`, `fallbackReason`, and the retryability flag

#### Scenario: An admin inspects a plan
- **GIVEN** a request with a bearer token for role `admin`
- **WHEN** the plan response is returned
- **THEN** `debug` includes model, token, and latency diagnostics
