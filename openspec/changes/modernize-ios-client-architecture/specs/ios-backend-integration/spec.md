## MODIFIED Requirements

### Requirement: iOS app targets the LeoCloud API base URL
The iOS app SHALL read the API base URL from the `Info.plist` key `IndooroAPIBaseURL`, which is set per build configuration to `http://localhost:8080/api` for `Debug-Local` and `https://it220209.cloud.htl-leonding.ac.at/api` for `Debug-LeoCloud` and `Release`, SHALL use HTTPS for every non-local base URL, and SHALL NOT send authentication headers, cookies set by the Admin Platform, device identifiers, or customer identifiers with any request.

#### Scenario: Any backend call is made in Release
- **GIVEN** a Release build performs a store, layout, product, recipe, or upsell request
- **WHEN** the request URL is built
- **THEN** it starts with `https://it220209.cloud.htl-leonding.ac.at/api/`

#### Scenario: Local development
- **GIVEN** the `MCindooroApp (Local)` scheme and a backend on `localhost:8080`
- **WHEN** the app loads stores
- **THEN** the request goes to `http://localhost:8080/api/mobile/stores`

#### Scenario: Request headers are inspected
- **GIVEN** a request produced by the iOS app
- **WHEN** its headers are inspected
- **THEN** it contains `Accept: application/json`, no `Authorization` header, and no customer or device identifier

## ADDED Requirements

### Requirement: Requests go through one asynchronous API client
The iOS app SHALL send every backend request through the `APIClient` actor using `async/await` and typed `Endpoint` values, SHALL map failures to `APIError` cases `offline`, `transport`, `http(status:message:)`, `decoding`, and `cancelled`, SHALL decode backend error bodies into the `message`, SHALL apply per-endpoint timeouts of 15 s for reads, 20 s for layouts, 25 s for upsell plans, and 3 s for upsell events and dismissals, and SHALL cancel a model's previous request task when that model starts a newer request of the same kind.

#### Scenario: Newer search cancels older search
- **GIVEN** a search for „mil“ is in flight
- **WHEN** a search for „milch“ starts
- **THEN** the „mil“ task is cancelled and its result is never applied

#### Scenario: Backend returns a JSON error
- **GIVEN** the backend responds with HTTP 404 and `{"message":"Filiale nicht gefunden."}`
- **WHEN** the client maps the response
- **THEN** it throws `APIError.http(status: 404, message: "Filiale nicht gefunden.")`

### Requirement: Idempotent reads retry transient failures
The API client SHALL retry `GET` requests at most twice with delays of 0.5 s and 1.0 s plus up to 250 ms jitter WHEN the request timed out, the connection was lost, the host could not be reached, or the status is 502, 503, or 504, SHALL NOT retry when the device is offline, and SHALL NOT automatically retry `POST` requests.

#### Scenario: Gateway hiccup
- **GIVEN** `GET /mobile/stores` returns 503 once and then 200
- **WHEN** the app loads stores
- **THEN** the stores are shown after one retry

#### Scenario: Plan request fails
- **GIVEN** `POST /mobile/upsell/plan` returns 503
- **WHEN** the response is handled
- **THEN** the client does not resend the request on its own

### Requirement: Wire contracts are verified against the backend OpenAPI document
The repository SHALL contain `api/openapi/indooro-mobile.yaml` exported from the backend for all routes consumed by the iOS app, the iOS networking target SHALL generate its wire types from this document with `swift-openapi-generator` and map them to domain models, and CI SHALL fail WHEN the exported backend contract differs from the committed document. Free-form layout JSON SHALL be verified with fixture-based decoding tests instead.

#### Scenario: Backend renames a field
- **GIVEN** a backend change renames `storeCode` in `MobileStoreSummary`
- **WHEN** CI runs
- **THEN** the contract check fails until the document and the iOS mapper are updated

### Requirement: Transport security relies on ATS without arbitrary loads
The iOS app SHALL NOT set `NSAllowsArbitraryLoads`, SHALL permit insecure HTTP only for `localhost` in the `Debug-Local` configuration, and SHALL NOT pin certificates for the LeoCloud host.

#### Scenario: Release Info.plist is inspected
- **GIVEN** a Release build
- **WHEN** its `Info.plist` is inspected
- **THEN** `NSAppTransportSecurity` contains neither `NSAllowsArbitraryLoads` nor exception domains

### Requirement: The app embeds no secrets
The iOS app SHALL NOT contain API keys, OpenAI keys, OIDC client secrets, or other credentials in source, configuration, or resources, and any future device-bound secret SHALL be stored in the Keychain with accessibility `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.

#### Scenario: Secret scan
- **GIVEN** the Swift sources, xcconfig files, and bundle resources
- **WHEN** a secret scanner runs in CI
- **THEN** no credential is found

### Requirement: Anonymous cost-bearing routes are rate limited
The backend SHALL limit `POST /api/mobile/upsell/plan` and `POST /api/mobile/upsell/suggestions` to 20 requests per client address per 10 minutes and `POST /api/mobile/upsell/events` and `POST /api/mobile/upsell/dismiss` to 120 requests per client address per 10 minutes, SHALL respond with HTTP 429 and `Retry-After` when a limit is exceeded, and the iOS app SHALL treat HTTP 429 from plan requests as empty suggestions without retry.

#### Scenario: Scripted abuse
- **GIVEN** a client sends 21 plan requests within 10 minutes
- **WHEN** the 21st request arrives
- **THEN** the backend responds with 429 and does not call OpenAI

#### Scenario: App receives 429
- **GIVEN** the backend responds to a plan request with 429
- **WHEN** the app handles it
- **THEN** no prompt is shown, no retry is sent, and the tour continues normally
