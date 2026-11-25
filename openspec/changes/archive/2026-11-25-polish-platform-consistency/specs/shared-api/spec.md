## ADDED Requirements

### Requirement: Create endpoints return 201 Created with Location
Every backend `POST` endpoint that creates a single resource SHALL answer `201 Created` with a `Location` header that points to a readable `GET` endpoint of the new resource and SHALL NOT return the entity body. Upsert `POST` endpoints SHALL answer `201 Created` when they create and `204 No Content` when they update, both with the `Location` header. Action endpoints (bulk, index, export, import, assign, release, activate, mobile) keep their documented responses.

#### Scenario: Admin creates a store
- **WHEN** an authorized admin sends `POST /api/stores` with a valid body
- **THEN** the response status is `201`
- **AND** the `Location` header points to `/api/stores/{id}` of the new store
- **AND** the response body is empty
- **AND** a `GET` on the `Location` URI with the same token returns the new store

#### Scenario: Upsert updates an existing category
- **WHEN** a client sends the category upsert `POST` for an id that already exists
- **THEN** the response status is `204`
- **AND** the `Location` header points to the category

#### Scenario: Action endpoint is unchanged
- **WHEN** a client sends `POST /api/beacons/{id}/assign`
- **THEN** the response keeps its documented status and body

### Requirement: Clients follow the Location header
Every first-party client that creates resources SHALL read the new resource through the `Location` header or by re-fetching, and the admin web client SHALL also accept a create response with a JSON body during rollout.

#### Scenario: Admin web creates a beacon
- **WHEN** the admin web creates a beacon and the server answers `201` with `Location`
- **THEN** the client fetches the `Location` URI and shows the new beacon without a page reload
