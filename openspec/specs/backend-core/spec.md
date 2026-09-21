# backend-core Specification

## Purpose
Defines the cross-cutting contract of the Quarkus backend: modular-monolith structure, PostgreSQL/OpenSearch persistence split, Flyway-only schema evolution, hybrid OIDC authentication, centralized scope decisions, transactional and audited mutations, record lifecycles, the shared error envelope, catalog and upsell data pipelines, environment-based configuration, and the payment non-goal.
## Requirements
### Requirement: Backend is a single Quarkus modular monolith
The backend SHALL be one Quarkus application in `backend/indooro_server` packaged as an uber-jar and SHALL be organized into REST resources (`at.htl.resource`, `at.htl.resource.admin`, `at.htl.resource.mobile`), services (`at.htl.service`, `at.htl.admin.service`), persistence (`at.htl.admin.entity`, `at.htl.admin.repository`, `at.htl.repository`), DTOs (`at.htl.admin.dto`), and configuration (`at.htl.config`). Resources SHALL delegate business rules to services and SHALL NOT access repositories directly, except for OpenSearch catalog utilities that predate this rule.

#### Scenario: A new admin endpoint is added
- **GIVEN** a change adds a region statistics endpoint
- **WHEN** it is implemented
- **THEN** the resource calls a service method and the service performs scope checks and repository access

#### Scenario: The application is packaged
- **GIVEN** the Maven build runs `mvn -B package`
- **WHEN** packaging finishes
- **THEN** `target/*-runner.jar` exists and is the only artifact copied into the container image

### Requirement: Operational data and catalog data use separate stores
The backend SHALL store regions, stores, beacons, beacon assignments, layout versions, user access assignments, recipes and their ingredients, steps, tags, units, ingredient-product mappings, audit logs, error logs, and upsell cache, event, and dismissal records in PostgreSQL, and SHALL store product documents, category documents, and legacy global layouts in OpenSearch indices named by `opensearch.index`, `opensearch.category-index`, and `opensearch.layout-index`. Cross-store references from PostgreSQL to OpenSearch SHALL use the product id and SHALL keep name and layout-code snapshots where the reference must survive catalog changes.

#### Scenario: A recipe ingredient is mapped to a product
- **GIVEN** product 101 exists in OpenSearch
- **WHEN** an admin confirms the mapping
- **THEN** PostgreSQL stores product id 101 together with the product name and layout code snapshots

#### Scenario: A product is deleted from the catalog
- **GIVEN** a mapping references product 101
- **WHEN** product 101 is deleted from OpenSearch
- **THEN** mapping status responses fall back to the stored snapshot instead of failing

### Requirement: Relational schema changes go through Flyway only
The backend SHALL change the PostgreSQL schema only through versioned Flyway migrations in `src/main/resources/db/migration`, SHALL run migrations at start-up, and SHALL start Hibernate with `database.generation=validate`. Existing migration files SHALL NOT be edited after they have been applied in any shared environment.

#### Scenario: A column is added
- **GIVEN** a change needs a new column on `stores`
- **WHEN** the change is implemented
- **THEN** it adds a new file `V<next>__<description>.sql` and updates the entity

#### Scenario: Entity and schema disagree
- **GIVEN** an entity field has no matching column
- **WHEN** the application starts
- **THEN** Hibernate schema validation fails the start-up

### Requirement: Backend authentication uses hybrid Quarkus OIDC
The backend SHALL use `quarkus-oidc` with `application-type=hybrid` against the Keycloak realm `indooro`, SHALL accept a browser session created by the authorization code flow for `/admin` pages and admin APIs, SHALL accept bearer tokens for API clients, SHALL expose logout at `/admin/logout`, and SHALL read the client secret from the environment. Route-level permissions in `application.properties` SHALL declare the public and authenticated path sets; detailed route classification is defined in `admin-authentication` and `shared-api`.

#### Scenario: A browser opens the admin area
- **GIVEN** no session cookie
- **WHEN** the browser requests `/admin/`
- **THEN** the backend redirects to the Keycloak login of realm `indooro`

#### Scenario: An API client sends a bearer token
- **GIVEN** a valid access token with realm role `admin`
- **WHEN** the client calls `GET /api/admin/me` with `Authorization: Bearer <token>`
- **THEN** the backend authenticates the request without a session cookie

### Requirement: Scope decisions are centralized
The backend SHALL combine `@RolesAllowed` on resources with scope checks in `AdminAccessService`, SHALL resolve the current user from the active `user_access_assignments` row matching the token subject, SHALL reject the request when the Keycloak role differs from the assignment role, and SHALL NOT implement region or store scope checks outside `AdminAccessService`. Role semantics are defined in `admin-role-access-control`.

#### Scenario: Role and assignment disagree
- **GIVEN** a token with role `admin` and an active assignment with role `store-manager`
- **WHEN** the user calls any protected admin API
- **THEN** the backend responds 403

#### Scenario: A new scoped mutation is added
- **GIVEN** a change adds a store-level mutation
- **WHEN** it is implemented
- **THEN** the service calls an `AdminAccessService` method before loading or changing data

### Requirement: Admin mutations are transactional and audited
Every mutation of regions, stores, beacons, beacon assignments, layout versions, recipes, recipe ingredients, recipe steps, and ingredient-product mappings SHALL run in a transaction and SHALL write an `audit_logs` row with entity type, entity id, action, German summary, and JSON snapshots of the state before and after the mutation where applicable. Audit rows SHALL be readable only by `admin` users, except that store audit history SHALL be readable by users with access to that store.

#### Scenario: A store is updated
- **GIVEN** a region manager updates a store in the assigned region
- **WHEN** the transaction commits
- **THEN** an audit row with entity type `STORE`, action `UPDATE`, and before/after snapshots exists

#### Scenario: A mutation fails validation
- **GIVEN** a store update with a duplicate store code
- **WHEN** the service rejects it with 409
- **THEN** no store change and no audit row are committed

### Requirement: Records follow explicit lifecycles
The backend SHALL archive instead of deleting regions, stores, beacons, recipe tags, and ingredient-product mappings (`ACTIVE` → `ARCHIVED`), SHALL manage recipes as `DRAFT` → `PUBLISHED` → `DRAFT` or `ARCHIVED`, SHALL manage layout versions as `DRAFT` or `ACTIVE` → `ARCHIVED` with at most one `ACTIVE` version per store, SHALL release active beacon assignments when a store or beacon is archived, and SHALL physically delete only products (OpenSearch documents), recipe ingredients, recipe steps, and recipe tag assignments.

#### Scenario: A store is archived
- **GIVEN** a store with two active beacon assignments
- **WHEN** the store is archived
- **THEN** the store status is `ARCHIVED`, `archived_at` is set, and both assignments are inactive with `released_at` set

#### Scenario: A layout version is activated
- **GIVEN** a store with active version 3 and draft version 4
- **WHEN** version 4 is activated
- **THEN** version 3 becomes `ARCHIVED` and version 4 becomes `ACTIVE`

### Requirement: Mapped API errors use one envelope and are recorded
The backend SHALL map `WebApplicationException` to the HTTP status it carries and any other throwable except Bean Validation failures to 500 (Bean Validation failures keep the Quarkus violation report with status 400), SHALL return the JSON body `ApiErrorResponse` with `status`, `error`, `method`, `path`, and `timestamp`, and SHALL record the error with status, method, path, message, error type, and a stack trace truncated to 12 000 characters in `error_logs`. A failure while recording a `WebApplicationException` SHALL NOT change the returned status.

#### Scenario: An unknown store is requested
- **GIVEN** no store with the requested id exists
- **WHEN** an admin calls `GET /api/stores/{storeId}`
- **THEN** the response is 404 with `{"status":404,"error":"Filiale nicht gefunden.",...}`

#### Scenario: Error logging fails
- **GIVEN** the database rejects the error log insert
- **WHEN** a 404 is mapped
- **THEN** the client still receives 404

### Requirement: Catalog data enters through explicit maintenance operations
Product and category data SHALL enter OpenSearch only through the product and category write endpoints or the admin product endpoint; the backend SHALL NOT import catalog files automatically at start-up, except that the category index SHALL be seeded from `META-INF/resources/assets/data/categories.json` when it is empty on first read. PDF conversion SHALL remain a utility that returns parsed items without persisting them. Detailed rules are defined in `catalog-maintenance-operations` and `pdf-catalog-import`.

#### Scenario: The backend starts with an empty product index
- **GIVEN** the `products` index has no documents
- **WHEN** the application starts
- **THEN** no product documents are created automatically

#### Scenario: Categories are read for the first time
- **GIVEN** the `categories` index is empty
- **WHEN** `GET /api/categories` is called
- **THEN** the backend indexes the bundled category seed and returns the categories sorted by code

### Requirement: Upsell ranking is a bounded pipeline with optional AI
The backend SHALL compute upsell plans by loading catalog candidates (store-scoped first, global fallback), excluding products already on the list, completed, or used as triggers, classifying products deterministically, optionally ranking with the OpenAI Responses API using a strict JSON schema, accepting only product ids from the candidate set with confidence at or above `upsell.min-confidence`, limiting suggestions to `upsell.max-suggestions` per opportunity, and caching responses by a SHA-256 context hash for `upsell.cache-ttl-minutes`. When OpenAI is disabled, unconfigured, slow, or returns invalid output, the backend SHALL return a deterministic or empty result instead of an error. Quality rules are defined in the upsell capabilities of the active upsell changes.

#### Scenario: OpenAI is disabled
- **GIVEN** `OPENAI_UPSELL_ENABLED=false`
- **WHEN** a plan is requested
- **THEN** the response has source `fallback` or `none` and no external call is made

#### Scenario: The model returns an unknown product id
- **GIVEN** the model output contains product id 999 that was not a candidate
- **WHEN** the output is validated
- **THEN** product 999 is dropped from the response

### Requirement: Runtime configuration comes from the environment
The backend SHALL read database (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`), OpenSearch (`opensearch.host`, `opensearch.port`), OIDC (`OIDC_AUTH_SERVER_URL` or `QUARKUS_OIDC_AUTH_SERVER_URL`, client id, client secret), and upsell/OpenAI (`UPSELL_*`, `OPENAI_*`) settings from environment variables or Quarkus configuration, and SHALL use the `prod` profile defaults `postgres` and `opensearch` as service host names in Kubernetes. Secrets SHALL be provided through Kubernetes secrets or local untracked files.

#### Scenario: The backend runs in Kubernetes
- **GIVEN** the `prod` profile
- **WHEN** no `DB_HOST` is set
- **THEN** the JDBC URL targets host `postgres`

#### Scenario: The OpenAI key is provided
- **GIVEN** the secret `indooro-openai-secret`
- **WHEN** the pod starts
- **THEN** `OPENAI_API_KEY` is injected from the secret and not from a tracked file

### Requirement: Backend processes no payments
The backend SHALL NOT process payments, store payment data, or integrate payment providers. Product prices SHALL be informational only.

#### Scenario: A payment feature is requested
- **GIVEN** a stakeholder asks for in-app checkout
- **WHEN** the request is evaluated
- **THEN** it requires a new OpenSpec change that revisits the project non-goals

#### Scenario: A product price is shown
- **GIVEN** a product with price 1.99
- **WHEN** a client displays it
- **THEN** the price is shown for orientation and no transaction is created

