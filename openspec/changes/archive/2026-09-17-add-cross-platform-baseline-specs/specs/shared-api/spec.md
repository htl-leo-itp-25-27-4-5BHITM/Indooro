## ADDED Requirements

### Requirement: Shared HTTP contract is documented as OpenAPI
The project SHALL maintain `openspec/specs/shared-api/openapi.yaml` as an OpenAPI 3.1 document that lists every HTTP route implemented under `backend/indooro_server/src/main/java/at/htl/resource`, with parameters, request bodies, response schemas, error responses, and an access class per operation. A change that adds, removes, or alters a route or a DTO field SHALL update the document in the same change.

#### Scenario: A DTO field is added
- **GIVEN** a change adds `openingHours` to `MobileStoreSummary`
- **WHEN** the change is implemented
- **THEN** `openapi.yaml` lists `openingHours` in the `MobileStoreSummary` schema

#### Scenario: The contract is reviewed
- **GIVEN** a reviewer wants to know which routes the iOS client may call anonymously
- **WHEN** the reviewer reads `openapi.yaml`
- **THEN** every operation carries the extension `x-indooro-access` with one of `public`, `authenticated`, `role:admin`, or `role:admin|region-manager|store-manager`

### Requirement: Routes are grouped by consumer and access class
The shared contract SHALL classify routes as follows: `mobile` routes under `/api/mobile/**` are public and consumed by the iOS client; `catalog` read routes `GET /api/products`, `GET /api/products/search`, `GET /api/products/{id}`, `GET /api/categories`, and `GET /api/categories/{categoryCode}` are public and consumed by the iOS client, the admin UI, and the customer web page; `legacy-layout` routes under `/api/layout/**` are consumed by the iOS fallback, the customer web page, and the legacy editor mode; `admin` routes under `/api/admin/**`, `/api/regions/**`, `/api/stores/**`, and `/api/beacons/**` are consumed only by the admin UI and API tests; `utility` routes `/api/convert/pdf-to-json` and `/api/export/pdf` are not consumed by any shipped client.

#### Scenario: A new iOS feature needs data
- **GIVEN** the iOS client needs store opening hours
- **WHEN** the route is designed
- **THEN** it is placed under `/api/mobile/**` and classified as public

#### Scenario: A utility route is considered for a client
- **GIVEN** a proposal wants the admin UI to call `/api/convert/pdf-to-json`
- **WHEN** the proposal is reviewed
- **THEN** it must first make the route admin-only as required by `protect-legacy-write-endpoints`

### Requirement: JSON payloads follow shared conventions
Request and response bodies SHALL be `application/json` except the PDF upload (`multipart/form-data`, part `file`) and the PDF export (`application/pdf`). Field names SHALL be camelCase. Entity identifiers from PostgreSQL SHALL be UUID strings; product identifiers and category codes SHALL be integers. Timestamps SHALL be ISO-8601 instants in UTC and MAY contain fractional seconds. Beacon UUIDs in responses SHALL be 32 lowercase hexadecimal characters without hyphens, and beacon identity keys SHALL be `<uuid>` or `<uuid>:<major>:<minor>`. Product layout codes SHALL be strings; the documented store format is `<categoryCode>/<meter>/<level>/<position>`, for example `310/1/1/1`.

#### Scenario: A client decodes a timestamp
- **GIVEN** a response field `createdAt` with value `2026-09-17T12:00:00.123456Z`
- **WHEN** a client decodes it
- **THEN** the client accepts fractional seconds

#### Scenario: A beacon is returned
- **GIVEN** a beacon created with UUID `FDA50693-A4E2-4FB1-AFCF-C6EB07647825`, major 1, and minor 2
- **WHEN** it is returned by `/api/beacons/{beaconId}`
- **THEN** `uuid` is `fda50693a4e24fb1afcfc6eb07647825` and `identityKey` is `fda50693a4e24fb1afcfc6eb07647825:1:2`

### Requirement: Mapped errors share one envelope
Errors produced by `WebApplicationException` or unexpected exceptions SHALL use the schema `ApiErrorResponse` (`status` integer, `error` string, `method` string, `path` string, `timestamp` instant). Clients SHALL read the human-readable message from `error` and SHALL decide behavior by HTTP status. Bean Validation failures SHALL return status 400. Legacy catalog, layout, and utility routes MAY still return `{"error": "..."}` or plain text until `establish-shared-api-contract` unifies them.

#### Scenario: A client requests an unknown recipe
- **GIVEN** no published recipe with the requested id
- **WHEN** the client calls `GET /api/mobile/recipes/{recipeId}`
- **THEN** the response status is 404 and the body contains `"error":"Rezept nicht gefunden."`

#### Scenario: A client sends an invalid dismissal
- **GIVEN** a dismissal body without `checkedProductId`
- **WHEN** the client calls `POST /api/mobile/upsell/dismiss`
- **THEN** the response status is 400

### Requirement: Paged lists share one envelope
Paged list routes SHALL use `PageResponse` with `content` (array), `page` (zero-based integer), `size` (integer), and `totalElements` (integer). `GET /api/stores`, `GET /api/admin/recipes`, `GET /api/mobile/recipes`, and `GET /api/mobile/recipes/search` SHALL be paged; admin page sizes SHALL be capped at 100 and mobile recipe page sizes at 50. Other list routes SHALL return plain JSON arrays or documented wrapper objects.

#### Scenario: A client requests too many recipes
- **GIVEN** a mobile client requests `size=500`
- **WHEN** `GET /api/mobile/recipes` is answered
- **THEN** the response `size` is 50

#### Scenario: A client reads a store page
- **GIVEN** 30 visible stores
- **WHEN** an admin requests `GET /api/stores?page=1&size=20`
- **THEN** the response contains 10 items in `content` and `totalElements` is 30

### Requirement: Clients read tolerantly and the backend evolves additively
Clients SHALL ignore unknown response fields. The backend SHALL NOT remove, rename, or change the type of a response field consumed by a shipped client without a change that updates the consuming client in the same release or introduces a new route version.

#### Scenario: The backend adds a field
- **GIVEN** the backend adds `openingHours` to `MobileStoreSummary`
- **WHEN** an older iOS build decodes the response
- **THEN** decoding succeeds and the field is ignored

#### Scenario: A field rename is proposed
- **GIVEN** a proposal renames `layoutCode` to `shelfCode`
- **WHEN** the proposal is reviewed
- **THEN** it keeps `layoutCode` or adds a versioned route, because the iOS client depends on it

### Requirement: Client events are synchronous HTTP calls
The system SHALL NOT use message brokers or asynchronous API channels between clients and backend. Client telemetry for upsell prompts SHALL be sent as `POST /api/mobile/upsell/events` and answered with 202 Accepted after the event has been stored.

#### Scenario: A prompt is shown
- **GIVEN** the iOS client shows an upsell prompt
- **WHEN** it reports the impression
- **THEN** it sends `POST /api/mobile/upsell/events` with `eventType` and receives 202

#### Scenario: An AsyncAPI document is requested
- **GIVEN** a stakeholder asks for AsyncAPI documentation
- **WHEN** the request is evaluated
- **THEN** the answer is that no asynchronous channels exist and OpenAPI covers the full contract
