## ADDED Requirements

### Requirement: Admin recipe management is protected
The Admin Platform SHALL expose recipe management only to authenticated users with sufficient recipe administration permissions and SHALL keep mobile recipe read routes separate from protected admin mutation routes.

#### Scenario: Admin opens recipe management
- **GIVEN** an authenticated `admin` with an active Indooro assignment opens the Admin Platform
- **WHEN** role-aware UI state is applied
- **THEN** recipe management navigation and mutation controls are available

#### Scenario: Anonymous user requests recipe admin API
- **GIVEN** recipe admin APIs exist under `/api/admin/recipes`
- **WHEN** an anonymous user requests a protected recipe admin route
- **THEN** the system rejects the request without exposing protected recipe management data

#### Scenario: Non-admin opens Admin Platform
- **GIVEN** an authenticated `region-manager` or `store-manager` opens the Admin Platform in the MVP
- **WHEN** role-aware UI state is applied
- **THEN** recipe mutation controls are hidden unless a future change defines scoped recipe permissions

### Requirement: Admins can maintain recipe content
The Admin Platform SHALL let authorized admins create, edit, list, preview, publish, deactivate, and archive recipes with ingredients, ordered steps, tags, portions, times, and optional image metadata.

#### Scenario: Admin creates recipe
- **GIVEN** an authorized admin enters valid recipe metadata, at least one ingredient, and at least one step
- **WHEN** the admin saves the recipe
- **THEN** the backend persists the recipe as a draft or published record according to the requested status

#### Scenario: Required content is missing
- **GIVEN** an authorized admin submits a recipe without a title, ingredient, or step
- **WHEN** the backend validates the request
- **THEN** it rejects the mutation and keeps existing recipe data unchanged

#### Scenario: Admin deactivates recipe
- **GIVEN** a recipe is published
- **WHEN** an authorized admin deactivates or archives it
- **THEN** the recipe is excluded from anonymous mobile recipe list/search/detail routes

### Requirement: Admins can maintain recipe tags and categories
The Admin Platform SHALL let authorized admins manage recipe tags/categories and assign them to recipes for mobile display and filtering.

#### Scenario: Tag is assigned to recipe
- **GIVEN** an authorized admin edits a recipe
- **WHEN** the admin selects an existing tag
- **THEN** the recipe detail and mobile summary can include that tag

#### Scenario: Duplicate tag code is submitted
- **GIVEN** a tag code already exists
- **WHEN** an admin submits another tag with that code
- **THEN** the backend rejects the duplicate tag identity

### Requirement: Admins can manage ingredient product mappings
The Admin Platform SHALL let authorized admins map recipe ingredients to catalog products, review mapping status, select among multiple candidates, and manually confirm mappings.

#### Scenario: Admin maps ingredient to product
- **GIVEN** an ingredient has no confirmed mapping
- **WHEN** an admin searches catalog products and chooses one product for the ingredient
- **THEN** the backend stores an active mapping with product id, product snapshot fields, mapping type, confidence, manual confirmation state, and optional store scope

#### Scenario: Multiple mapping candidates exist
- **GIVEN** an ingredient such as milk has multiple candidate products
- **WHEN** the admin reviews mapping suggestions
- **THEN** the UI presents candidates for manual selection instead of auto-publishing an ambiguous mapping

#### Scenario: Product has no layout position
- **GIVEN** an admin maps an ingredient to a product without a usable layout code
- **WHEN** the mapping is saved or previewed
- **THEN** the Admin Platform marks the mapping as non-routable or incomplete so the admin can correct it

### Requirement: Mapping suggestions are reviewable and bounded
The backend SHALL provide mapping suggestions based on product search, category hints, normalized ingredient names, and optional synonyms, but SHALL require explicit status and confidence in suggestion responses.

#### Scenario: Suggestion endpoint is called
- **GIVEN** an authorized admin requests suggestions for an ingredient
- **WHEN** the backend searches catalog products
- **THEN** the response returns a bounded candidate list with product fields, confidence, reason, and store context where supplied

#### Scenario: No suggestion is safe
- **GIVEN** the backend cannot find a confident product candidate
- **WHEN** suggestions are requested
- **THEN** the response is empty or marked low-confidence and no mapping is created automatically

### Requirement: Admin preview exposes recipe mobile readiness
The Admin Platform SHALL provide a preview or readiness state that shows whether a recipe is publishable and which ingredients are mapped, ambiguous, unmapped, unavailable in a selected store, or mapped to products without layout positions.

#### Scenario: Admin previews recipe
- **GIVEN** a recipe has mixed mapping states
- **WHEN** the admin opens the recipe preview
- **THEN** the UI shows the mobile-facing recipe content and ingredient mapping readiness before publish

#### Scenario: Publish validation fails
- **GIVEN** a recipe has invalid core content
- **WHEN** an admin attempts to publish it
- **THEN** the backend rejects publish and returns validation details that the Admin UI can show without consuming the response body multiple times
