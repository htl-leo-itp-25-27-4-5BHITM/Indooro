## ADDED Requirements

### Requirement: External calls run outside database transactions
The backend SHALL NOT hold a database transaction or connection while waiting for OpenAI or other external HTTP services. OpenAI calls SHALL use one application-scoped HTTP client with a configurable base URL, SHALL be limited to four concurrent calls with a bounded waiting queue, and SHALL fall back to deterministic ranking when the limit, the timeout, or an error occurs.

#### Scenario: OpenAI is slow
- **GIVEN** OpenAI answers after 12 seconds and 40 plan requests arrive concurrently
- **WHEN** an admin calls `GET /api/stores` during that time
- **THEN** the store list responds without waiting for a free database connection

#### Scenario: The concurrency limit is reached
- **GIVEN** four OpenAI calls are running and the queue is full
- **WHEN** another plan request needs ranking
- **THEN** the backend answers with deterministic or empty suggestions instead of waiting

### Requirement: List endpoints use a bounded number of queries
`GET /api/mobile/recipes`, `GET /api/mobile/recipes/search`, and `GET /api/admin/recipes` SHALL load a page with at most five SQL statements independent of page size and SHALL NOT call OpenSearch. `GET /api/stores` SHALL load a page with at most five SQL statements, and `GET /api/beacons` SHALL use at most four SQL statements independent of the number of beacons. Mapping status for recipe details SHALL resolve products with one OpenSearch multi-get request.

#### Scenario: Twenty recipes are listed
- **GIVEN** 20 published recipes with eight ingredients each and SQL statement logging enabled
- **WHEN** `GET /api/mobile/recipes?size=20` is called
- **THEN** at most five SQL statements and no OpenSearch requests are executed

#### Scenario: A recipe mapping status is requested
- **GIVEN** a recipe with eight mapped ingredients
- **WHEN** `GET /api/mobile/recipes/{recipeId}/product-mapping` is called
- **THEN** exactly one OpenSearch multi-get request resolves the products

### Requirement: Upsell catalog lookups are batched and relevance-based
The backend SHALL resolve all upsell trigger products of a request with one OpenSearch multi-get request and SHALL select candidates with a query that scores trigger categories, complementary categories, and store scope, ordered by score and then product id, instead of an unordered `match_all`.

#### Scenario: A plan with many triggers is requested
- **GIVEN** a plan request with 30 opportunities and 5 trigger ids each
- **WHEN** the plan is computed
- **THEN** the trigger products are loaded with one multi-get request

#### Scenario: The catalog has more products than the candidate limit
- **GIVEN** 2 000 indexed products and a pasta trigger
- **WHEN** candidates are selected with a limit of 150
- **THEN** sauce and cheese products from complementary categories are ranked before unrelated products and repeated requests return the same order

### Requirement: The current admin user is resolved once per request
The backend SHALL load the active access assignment of the current user at most once per HTTP request, including its region and store, and SHALL reuse it for all scope checks of that request.

#### Scenario: A store update performs several checks
- **GIVEN** a region manager updates a store
- **WHEN** the request performs role, region, and store checks
- **THEN** `user_access_assignments` is queried once

#### Scenario: Two requests arrive
- **GIVEN** two consecutive requests of the same user
- **WHEN** both are processed
- **THEN** each request loads the assignment once, so deactivations take effect on the next request

### Requirement: Search indices are prepared at start-up
The backend SHALL ensure the product, category, and layout indices exist and SHALL seed categories when the category index is empty during start-up, SHALL report readiness DOWN while OpenSearch is unreachable, and SHALL NOT create indices or count documents on request paths. The layout index SHALL store element arrays without dynamic field mapping.

#### Scenario: Layouts are read repeatedly
- **GIVEN** the application has started
- **WHEN** `GET /api/layout/current` is called 100 times
- **THEN** no index creation or existence request is sent to OpenSearch

#### Scenario: OpenSearch starts after the backend
- **GIVEN** OpenSearch is unavailable at start-up
- **WHEN** it becomes available
- **THEN** the backend prepares the indices within 30 seconds and readiness becomes UP

### Requirement: Catalog and layout list parameters are bounded
The backend SHALL clamp `size` on `GET /api/products` to 1–500 and on `GET /api/products/search` to 1–100, SHALL clamp `limit` on `GET /api/layout/history` to 1–50, and SHALL let OpenSearch filter legacy layout versions by record type and sort them by `savedAt`.

#### Scenario: A huge product page is requested
- **GIVEN** 10 000 products
- **WHEN** `GET /api/products?size=100000` is called
- **THEN** the response contains at most 500 products and status 200

#### Scenario: Layout history is requested
- **GIVEN** 80 legacy layout versions
- **WHEN** `GET /api/layout/history?limit=10` is called
- **THEN** the ten newest versions are returned

### Requirement: Static and unchanged layouts are served efficiently
The backend SHALL parse the bundled default layout once per application lifecycle and return copies, and SHALL answer `GET /api/mobile/stores/{storeId}/layout/current` with an `ETag` derived from the layout id and activation time (or the bundled layout version) and with 304 Not Modified when `If-None-Match` matches.

#### Scenario: The iOS client revalidates a layout
- **GIVEN** the client cached a layout with ETag `"abc"`
- **WHEN** it requests the layout with `If-None-Match: "abc"` and the active version is unchanged
- **THEN** the backend responds 304 without a body

#### Scenario: A new version is activated
- **GIVEN** the client cached a layout with ETag `"abc"`
- **WHEN** an admin activates another version and the client revalidates
- **THEN** the backend responds 200 with a new ETag

### Requirement: Search clients have one managed lifecycle
The backend SHALL create one application-scoped OpenSearch client and SHALL close its transport when the application stops.

#### Scenario: Services inject the client
- **GIVEN** four services inject `OpenSearchClient`
- **WHEN** the application runs
- **THEN** all services share one client instance

#### Scenario: Dev mode reloads
- **GIVEN** Quarkus dev mode
- **WHEN** the application restarts after a code change
- **THEN** the previous client transport is closed

### Requirement: Persistence indexes match query patterns
The schema SHALL provide case-insensitive unique indexes for region codes, recipe tag codes, store codes, beacon codes, and recipe slugs; trigram indexes for recipe title, summary, and description search; an index on `audit_logs.created_at`; an index on `upsell_suggestion_cache.expires_at`; and an index supporting active dismissal lookups. The unused index `idx_upsell_suggestion_cache_lookup` SHALL be removed.

#### Scenario: Two stores differ only by case
- **GIVEN** a store with code `HA-01`
- **WHEN** another store with code `ha-01` is inserted concurrently
- **THEN** the database rejects the second insert and the API answers 409

#### Scenario: Recipe search uses the index
- **GIVEN** 10 000 recipes
- **WHEN** a mobile search for `tomate` runs
- **THEN** the query plan uses the trigram index

### Requirement: Operational data has retention
The backend SHALL delete expired upsell cache entries older than one day, upsell events older than 180 days, and upsell dismissals whose suppression ended more than 30 days ago at least daily, and SHALL keep only the 50 newest legacy global layout versions.

#### Scenario: The retention job runs
- **GIVEN** upsell events from 200 days ago
- **WHEN** the daily job runs
- **THEN** those events are deleted and newer events remain

#### Scenario: A 51st legacy layout is saved
- **GIVEN** 50 legacy layout versions
- **WHEN** another legacy layout is saved and the job runs
- **THEN** the oldest version is deleted

### Requirement: Dismissals suppress upsell suggestions
The backend SHALL exclude suggestions matching an active dismissal (`suppressed_until` in the future) for the same session hash and store, SHALL treat a dismissal without `suggestedProductId` as suppressing all suggestions for the checked product, and SHALL match dismissals with null-safe comparison so repeated dismissals increment `dismissal_count`.

#### Scenario: A dismissed suggestion is requested again
- **GIVEN** a dismissal for checked product 10 and suggested product 20 suppressed for 240 minutes
- **WHEN** the same session requests a plan with trigger product 10 within that time
- **THEN** product 20 is not suggested for that opportunity

#### Scenario: A dismissal without session is repeated
- **GIVEN** a dismissal with `sessionId` null for checked product 10
- **WHEN** the same dismissal is sent again
- **THEN** the existing row is updated and `dismissal_count` becomes 2

### Requirement: Concurrent writes produce conflicts instead of server errors
The backend SHALL serialize layout version numbering and activation per store and SHALL translate unique-constraint violations into 409 responses with a German message.

#### Scenario: Two layout versions are saved at the same time
- **GIVEN** a store with latest version 4
- **WHEN** two users save a version concurrently
- **THEN** the versions receive numbers 5 and 6 and both requests succeed

#### Scenario: Two beacons with the same code are created at the same time
- **GIVEN** no beacon with code `B-100`
- **WHEN** two admins create `B-100` concurrently
- **THEN** one request succeeds and the other receives 409

### Requirement: Beacon identities are valid iBeacon values
The backend SHALL accept beacon major and minor values only between 0 and 65 535 and SHALL enforce the range in the database. When a mobile lookup provides major and minor without an active exact match, the backend SHALL fall back only to active beacons with the same UUID that have no major and minor.

#### Scenario: An invalid minor is submitted
- **GIVEN** an admin creates a beacon with minor 70 000
- **WHEN** the request is validated
- **THEN** the backend responds 400

#### Scenario: An unknown exact identity is looked up
- **GIVEN** active beacons `uuid:1:1` and `uuid:1:2` and no beacon `uuid:1:9`
- **WHEN** the iOS client looks up `uuid` with major 1 and minor 9
- **THEN** the backend responds 404

### Requirement: Index maintenance reports real outcomes
`POST /api/admin/index/create` SHALL respond 409 when the product index already exists and 503 when OpenSearch is unreachable, and `DELETE /api/admin/index` SHALL respond 404 when the index does not exist.

#### Scenario: The index already exists
- **GIVEN** the product index exists
- **WHEN** an admin calls `POST /api/admin/index/create`
- **THEN** the response status is 409

#### Scenario: OpenSearch is down
- **GIVEN** OpenSearch is unreachable
- **WHEN** an admin calls `POST /api/admin/index/create`
- **THEN** the response status is 503
