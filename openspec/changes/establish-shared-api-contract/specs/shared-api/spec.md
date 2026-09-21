## ADDED Requirements

### Requirement: Generated and reviewed contracts stay in parity
The build SHALL export the backend's generated OpenAPI document and SHALL fail when its paths, operations, parameters, request bodies, or response schemas differ from `openspec/specs/shared-api/openapi.yaml` after normalization. Every operation in the generated document SHALL have an operation id equal to the one in the reviewed contract.

#### Scenario: A DTO field is renamed only in Java
- **GIVEN** a developer renames `storeCode` to `code` in `MobileStoreSummary` without updating the reviewed contract
- **WHEN** the contract job runs
- **THEN** the job fails and reports the schema difference

#### Scenario: A new endpoint is documented
- **GIVEN** a change adds an endpoint in Java and the same operation to the reviewed contract
- **WHEN** the contract job runs
- **THEN** the parity check passes

### Requirement: Breaking contract changes require a new API version
The build SHALL detect breaking changes between the reviewed contract on the target branch and the proposed contract, and SHALL reject them unless the affected operations are added under a new version prefix while the previous version remains available.

#### Scenario: A required request field is added to a v1 operation
- **GIVEN** `POST /api/v1/mobile/upsell/plan` gains a new required field
- **WHEN** the breaking-change check runs
- **THEN** the check fails

#### Scenario: A v2 operation is introduced
- **GIVEN** the new behavior is added as `POST /api/v2/mobile/upsell/plan` and v1 is unchanged
- **WHEN** the breaking-change check runs
- **THEN** the check passes

### Requirement: Routes are available under a version prefix
The backend SHALL serve every route under `/api/v1/…` with the same behavior and permissions as the corresponding unversioned `/api/…` route, SHALL add the header `Indooro-Api-Version` to API responses, and SHALL keep unversioned routes as v1 aliases until a change removes them.

#### Scenario: A client calls the versioned route
- **GIVEN** active stores exist
- **WHEN** a client calls `GET /api/v1/mobile/stores`
- **THEN** the response equals `GET /api/mobile/stores` and carries `Indooro-Api-Version: 1`

#### Scenario: An anonymous client calls a versioned admin route
- **GIVEN** no session or token
- **WHEN** the client calls `GET /api/v1/stores`
- **THEN** the backend rejects the request exactly like `GET /api/stores`

### Requirement: Deprecated operations are signalled
The backend SHALL mark deprecated operations in the contract and SHALL return `Deprecation`, `Sunset`, and `Link` (successor) headers for `POST /api/mobile/upsell/suggestions`, `POST /api/products`, `POST /api/products/bulk`, and `POST /api/layout/current`. A deprecated operation SHALL remain available for at least six months after the first release that signals it.

#### Scenario: A client uses the legacy bulk import
- **GIVEN** an admin tool calls `POST /api/products/bulk`
- **WHEN** the response is returned
- **THEN** it includes `Deprecation`, a `Sunset` date at least six months ahead, and a `Link` to the admin product route

#### Scenario: The sunset date has not passed
- **GIVEN** a deprecated operation within its sunset period
- **WHEN** it is called
- **THEN** it still behaves as documented

### Requirement: All API errors use the shared error envelope
Every error response of `/api/**`, including catalog, legacy layout, maintenance, and PDF utility routes, SHALL use `ApiErrorResponse` with content type `application/json`; Bean Validation failures MAY keep the Quarkus violation report.

#### Scenario: A product search without query is sent
- **GIVEN** a client calls `GET /api/products/search` without `q`
- **WHEN** the error is returned
- **THEN** the body is an `ApiErrorResponse` with status 400

#### Scenario: A PDF upload without file is sent
- **GIVEN** a client posts an empty multipart body to `/api/convert/pdf-to-json`
- **WHEN** the error is returned
- **THEN** the body is an `ApiErrorResponse` with status 400 and content type `application/json`

### Requirement: Client types are generated from the contract
The filtered iOS contract `api/openapi/indooro-mobile.yaml` SHALL be derived from the reviewed contract (operations whose `x-indooro-consumers` include `ios`) and SHALL be the input for the Swift wire types generated with `swift-openapi-generator`, and the Admin UI SHALL type-check its API usage against TypeScript declarations generated from the reviewed contract. Generated files SHALL be reproducible and checked in CI.

#### Scenario: The contract changes a schema
- **GIVEN** a change adds `openingHours` to `MobileStoreSummary`
- **WHEN** the generators run
- **THEN** the Swift type and the TypeScript declaration contain `openingHours` and the CI up-to-date check passes only if the regenerated files are committed

#### Scenario: Admin code reads a missing field
- **GIVEN** `app.js` reads `layout.active` from `LayoutVersionSummary`
- **WHEN** `npm run admin:typecheck` runs
- **THEN** the type check reports that `active` does not exist

### Requirement: Contract tests validate real and mocked responses
The httpYac suites SHALL validate response bodies against the contract schemas, and the Admin UI smoke mocks SHALL be validated against the same schemas.

#### Scenario: The deployed API returns an undocumented shape
- **GIVEN** the LeoCloud backend returns `stores.items` instead of `stores.content`
- **WHEN** `npm run api:test` runs
- **THEN** the schema validation step fails

#### Scenario: A mock is outdated
- **GIVEN** a smoke mock lacks a required field
- **WHEN** `npm run admin:test` runs
- **THEN** the mock validation fails
