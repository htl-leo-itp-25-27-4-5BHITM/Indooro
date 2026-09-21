## ADDED Requirements

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
