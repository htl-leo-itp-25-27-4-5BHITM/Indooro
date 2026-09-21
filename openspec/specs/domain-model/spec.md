# domain-model Specification

## Purpose
Defines the core Indooro domain model across regions, stores, beacons, assignments, layout versions, user access assignments, operational logs, PostgreSQL state, and OpenSearch search documents.
## Requirements
### Requirement: Regions contain stores
The system SHALL model a region as the parent grouping for stores and SHALL preserve the relationship between each store and its region for admin management, scope filtering, and mobile display.

#### Scenario: Store is listed with regional context
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** an authorized admin user lists stores
- **THEN** each store can be interpreted in the context of its owning region

#### Scenario: Region manager scope is evaluated
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** a `region-manager` accesses store data
- **THEN** the system can compare the store's region with the user's assigned region

### Requirement: Stores are the central operational unit
The system SHALL treat a store as the central unit connecting public mobile metadata, product/layout lookup, beacon assignments, layout versions, and scoped admin management.

#### Scenario: Mobile client selects a store
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** a mobile client selects or detects a store
- **THEN** product lookup, layout retrieval, and route calculation can be scoped to that store

#### Scenario: Store manager scope is evaluated
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** a `store-manager` accesses protected admin data
- **THEN** the system can compare the requested store with the user's assigned store

### Requirement: Beacon identities are normalized and unique for detection
The system SHALL store and expose beacon identities in a normalized form suitable for mobile detection and SHALL avoid duplicate active beacon identities in mobile-facing detection responses.

#### Scenario: Beacon UUID is stored after normalization
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** a beacon UUID is persisted or migrated
- **THEN** the system uses a normalized identity form that is stable for matching

#### Scenario: Mobile identity list is generated
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** the system returns active mobile beacon identities
- **THEN** duplicate UUIDs are removed from the response

### Requirement: Beacon assignments represent store membership over time
The system SHALL model beacon assignment separately from beacon identity so a physical beacon can be assigned, released, archived, or reassigned without losing its historical identity.

#### Scenario: Beacon is assigned to a store
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** an authorized admin assigns a beacon to a store
- **THEN** the system records the store relationship through an assignment rather than changing the beacon identity itself

#### Scenario: Beacon is released
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** an authorized admin releases a beacon assignment
- **THEN** historical assignment data remains distinguishable from the current active assignment

### Requirement: Layout versions belong to stores
The system SHALL model layout versions as store-specific records and SHALL distinguish active/current layout versions from inactive historical versions.

#### Scenario: Current layout is requested
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** a client requests the current layout for a store
- **THEN** the system returns the active layout version for that store if one exists

#### Scenario: Historical layout remains available for audit
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** a new layout version is activated
- **THEN** previous layout versions remain distinguishable from the active version

### Requirement: User access assignments map Keycloak identities to Indooro scope
The system SHALL map the stable Keycloak subject claim to an Indooro user access assignment containing username, email, role, optional region scope, optional store scope, status, creation time, and update time.

#### Scenario: Current user is resolved
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** an authenticated Admin Platform user calls a protected admin route
- **THEN** the system resolves the user's Indooro role and scope from the Keycloak subject

#### Scenario: Assignment is inactive
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** the Keycloak subject maps to an inactive or disabled assignment
- **THEN** the system denies protected admin access

### Requirement: Operational logs are persistent domain records
The system SHALL persist audit logs for admin actions and error logs for operational failures so administrators and developers can inspect system behavior.

#### Scenario: Admin action is performed
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** an authorized admin mutates managed data
- **THEN** the system can record who acted, what changed, and when the action occurred

#### Scenario: Client or backend error is recorded
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** a relevant admin/frontend/backend error is logged
- **THEN** the error can be inspected through the protected error log workflow by an authorized user

### Requirement: PostgreSQL and OpenSearch responsibilities are distinct
The system SHALL use PostgreSQL for operational admin/domain state and OpenSearch for search-oriented product, category, and layout documents.

#### Scenario: Region is edited
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** an authorized admin creates, updates, archives, or lists regions
- **THEN** the operation uses PostgreSQL-backed domain state

#### Scenario: Product is searched
- **GIVEN** the Indooro domain model and persistence layer are available
- **WHEN** an anonymous customer searches products
- **THEN** the operation uses search-oriented catalog data rather than admin-region persistence tables

### Requirement: Admin domain uniqueness constraints are explicit
The database model SHALL enforce uniqueness for region codes, store codes, beacon codes, beacon identity keys, one active layout per store, and one active assignment per beacon where those constraints are part of the current schema.

#### Scenario: Duplicate store code is created
- **GIVEN** a store with the requested store code already exists
- **WHEN** an admin attempts to create another store with the same code
- **THEN** the database/backend rejects the duplicate identity

#### Scenario: Second active layout is activated
- **GIVEN** a store already has an active layout version
- **WHEN** another layout version for the same store is activated
- **THEN** the system ensures only one layout version remains active for that store

### Requirement: Runtime sample data is illustrative
Runtime object diagrams and sample database values SHALL be treated as illustrative current-state evidence, not permanent business constants.

#### Scenario: Sample region exists
- **GIVEN** documentation shows sample region/store/beacon IDs from LeoCloud
- **WHEN** a future change uses those examples
- **THEN** it must not hardcode those UUIDs as permanent business identifiers unless explicitly seeded for demo users or tests

#### Scenario: Sample data reveals inconsistency
- **GIVEN** runtime documentation shows active beacons assigned to one store and an active layout belonging to another store
- **WHEN** a future change depends on aligned store/layout/beacon data
- **THEN** it must verify or seed coherent test/demo data before using the sample state as proof

### Requirement: Error logs capture failed API requests
The domain model SHALL persist operational error records with status code, method, path, message, error type, stack trace where available, and timestamps for protected diagnostics.

#### Scenario: Validation request fails
- **GIVEN** an admin API request fails validation
- **WHEN** the error mapper records the failure
- **THEN** an error log record can be inspected by authorized diagnostics users

#### Scenario: Error data is exposed
- **GIVEN** error log records exist
- **WHEN** a client requests protected error logs as an authorized admin
- **THEN** the response includes diagnostic fields without exposing them through anonymous routes

### Requirement: Stores can carry real outdoor coordinates
The store domain model SHALL support nullable latitude and longitude fields for real-world store positions used by mobile store selection maps.

#### Scenario: Store has coordinates
- **GIVEN** a store record has latitude and longitude values
- **WHEN** backend APIs build store responses
- **THEN** the store can be represented at its persisted real-world coordinate

#### Scenario: Store lacks coordinates
- **GIVEN** a store record has no latitude or longitude
- **WHEN** a mobile store map is rendered
- **THEN** the client must not invent a fake production coordinate for that store

#### Scenario: Coordinates are validated
- **GIVEN** an admin creates or updates store coordinates
- **WHEN** latitude or longitude is outside the valid geographic range
- **THEN** the backend rejects the invalid coordinate values

### Requirement: Recipes are PostgreSQL domain records
The database model SHALL store recipes as PostgreSQL records with UUID primary keys, audit timestamps, lifecycle status, searchable metadata, optional image metadata, serving counts, and cooking time fields.

#### Scenario: Recipe is persisted
- **GIVEN** an authorized admin creates a recipe
- **WHEN** the backend persists the recipe
- **THEN** the record has an id, title, slug or stable code, status, created_at, updated_at, servings, optional summary, optional description, optional image URL or image metadata, and time fields

#### Scenario: Duplicate recipe slug is submitted
- **GIVEN** a recipe already exists with a slug or stable code
- **WHEN** an admin submits another recipe with the same slug or stable code
- **THEN** the database/backend rejects the duplicate identity

### Requirement: Recipe ingredients are ordered and cascade with recipes
The database model SHALL store recipe ingredients as ordered child records of a recipe, preserving display name, normalized ingredient name, quantity, unit, optional preparation note, optional flag, and audit timestamps.

#### Scenario: Ingredient is added to a recipe
- **GIVEN** a recipe exists
- **WHEN** an authorized admin adds `250 g flour` as ingredient position 1
- **THEN** the ingredient record belongs to the recipe, preserves quantity and unit separately, and can be returned in deterministic order

#### Scenario: Recipe is deleted or archived according to lifecycle rules
- **GIVEN** a recipe owns ingredient records
- **WHEN** recipe child data is removed by an allowed maintenance operation
- **THEN** recipe ingredients cascade with the recipe or are excluded by recipe lifecycle filters according to the documented archive/delete behavior

### Requirement: Recipe steps are ordered and cascade with recipes
The database model SHALL store preparation steps as ordered recipe child records with instruction text and optional duration metadata.

#### Scenario: Recipe detail is loaded
- **GIVEN** a recipe has multiple step records
- **WHEN** the backend builds a recipe detail response
- **THEN** steps are returned in step number order

#### Scenario: Step number is duplicated
- **GIVEN** a recipe already has a step with number 2
- **WHEN** an admin submits another step number 2 for the same recipe
- **THEN** the database/backend rejects the duplicate ordering conflict

### Requirement: Recipe tags and assignments are normalized
The database model SHALL store recipe tags/categories separately from recipe records and SHALL assign them through a join table with uniqueness constraints.

#### Scenario: Tag is assigned
- **GIVEN** a tag such as `vegetarian` exists
- **WHEN** an admin assigns it to a recipe
- **THEN** the assignment links the recipe and tag once and can be used for filtering/search display

#### Scenario: Duplicate tag assignment is submitted
- **GIVEN** a recipe already has a tag assignment
- **WHEN** the same tag is assigned again
- **THEN** the database/backend rejects or ignores the duplicate without creating two assignments

### Requirement: Ingredient product mappings preserve catalog boundaries
The database model SHALL store ingredient-to-product mappings without treating OpenSearch product documents as PostgreSQL-owned product rows.

#### Scenario: Mapping references catalog product
- **GIVEN** a recipe ingredient maps to product id 123 from the catalog
- **WHEN** the mapping is persisted
- **THEN** the mapping stores product id, optional product name snapshot, optional layout code snapshot, mapping type, confidence, manual confirmation state, lifecycle status, and optional store scope

#### Scenario: Store-specific mapping is created
- **GIVEN** the same ingredient maps to different products in different stores
- **WHEN** store-specific mappings are persisted
- **THEN** each mapping can reference a nullable store id and/or store code while preserving a global fallback mapping

#### Scenario: Product document changes
- **GIVEN** a mapped OpenSearch product is updated or removed
- **WHEN** the recipe mapping is resolved
- **THEN** the backend verifies the current product document before returning a routable mapping and reports unavailable status when the product cannot be resolved

### Requirement: Ingredient synonyms are optional normalized records
The database model SHALL support ingredient synonyms as optional normalized records that connect locale-specific terms to canonical ingredient names for mapping suggestions.

#### Scenario: Synonym is persisted
- **GIVEN** `Paradeiser` should map to canonical ingredient `tomato`
- **WHEN** an admin saves the synonym for a locale
- **THEN** the synonym is unique for that locale and can be used for search or mapping suggestions

#### Scenario: Synonym conflicts
- **GIVEN** a synonym already maps to a canonical ingredient for a locale
- **WHEN** an admin submits the same synonym for a conflicting canonical ingredient
- **THEN** the backend rejects the conflict or requires explicit admin correction

### Requirement: Units are optional normalized records
The database model SHALL support units as optional normalized records for recipe quantities, with codes such as `g`, `kg`, `ml`, `l`, `piece`, `pinch`, `tbsp`, and `tsp`.

#### Scenario: Unit is used by ingredient
- **GIVEN** a unit record exists for grams
- **WHEN** a recipe ingredient stores a gram quantity
- **THEN** the ingredient references the unit code and still preserves the original display quantity for mobile UI

#### Scenario: Unit conversion is unavailable
- **GIVEN** a unit has no safe conversion to a package quantity
- **WHEN** the mobile app adds the ingredient to the shopping list
- **THEN** the system preserves the ingredient quantity as metadata instead of inventing a package quantity conversion

### Requirement: Recipe schema uses explicit indexes and lifecycle constraints
The recipe tables SHALL define primary keys, foreign keys, indexes, unique constraints, and status constraints needed for safe mobile queries and admin maintenance.

#### Scenario: Mobile recipes are listed
- **GIVEN** many recipes exist
- **WHEN** the mobile list endpoint queries published recipes by status and title/search metadata
- **THEN** the query can use indexes for status, title or normalized search fields, tags, and update or publish timestamps

#### Scenario: Admin archives recipe
- **GIVEN** a recipe is published
- **WHEN** an authorized admin deactivates or archives it
- **THEN** the recipe remains historically inspectable but is excluded from anonymous mobile recipe results

