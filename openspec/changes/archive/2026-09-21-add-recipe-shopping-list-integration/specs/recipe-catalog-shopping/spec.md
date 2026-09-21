## ADDED Requirements

### Requirement: Mobile recipe catalog is public and read-only
The system SHALL expose published recipe catalog data through anonymous mobile routes without requiring Admin Platform login or a customer account.

#### Scenario: Anonymous client lists recipes
- **GIVEN** published recipes exist
- **WHEN** an anonymous mobile client requests `GET /api/mobile/recipes`
- **THEN** the backend returns a paginated list of published recipe summaries

#### Scenario: Anonymous client searches recipes
- **GIVEN** published recipes exist with titles, tags, and ingredient names
- **WHEN** an anonymous mobile client requests `GET /api/mobile/recipes/search?q=<term>&page=<page>&size=<size>`
- **THEN** the backend returns matching published recipe summaries and applies bounded pagination

#### Scenario: Draft recipe is requested
- **GIVEN** a recipe exists but is not published
- **WHEN** an anonymous mobile client requests the recipe through a mobile route
- **THEN** the backend does not expose the draft recipe

### Requirement: Recipe details include structured cooking content
The mobile recipe detail response SHALL include recipe identity, title, description or summary where available, servings, preparation time, cooking time, total time, tags, optional image metadata, ordered ingredients, and ordered steps.

#### Scenario: Recipe detail is opened
- **GIVEN** a published recipe has ingredients, steps, tags, times, portions, and image metadata
- **WHEN** the mobile client requests `GET /api/mobile/recipes/{recipeId}`
- **THEN** the response includes the recipe detail fields needed to render the recipe without additional admin routes

#### Scenario: Recipe has no image
- **GIVEN** a published recipe has no image URL or image data
- **WHEN** the mobile client opens the recipe detail
- **THEN** the response remains valid and the client can render an image-free recipe state

### Requirement: Ingredient and product concepts remain distinct
The system SHALL distinguish a generic recipe ingredient from a supermarket product, a concrete package/article, the amount required by the recipe, and the quantity stored on a shopping list.

#### Scenario: Ingredient maps to a package
- **GIVEN** a recipe ingredient says `250 g flour`
- **WHEN** it maps to a catalog product such as `SPAR Weizenmehl glatt 1kg`
- **THEN** the mapping preserves the ingredient quantity separately from the product identity and shopping-list package quantity

#### Scenario: Shopping-list quantity is derived conservatively
- **GIVEN** a mapped ingredient has a recipe quantity that does not directly equal the package size
- **WHEN** the mobile app adds the ingredient to the shopping list
- **THEN** the app uses a conservative shopping-list quantity and preserves the recipe quantity as ingredient metadata or note text

### Requirement: Ingredient product mapping is explicit
Recipe ingredients SHALL resolve to catalog products only through stored mappings, manually confirmed mappings, or bounded mapping suggestions that clearly report confidence and candidate status.

#### Scenario: Exact product mapping exists
- **GIVEN** a recipe ingredient has an active exact mapping to a catalog product
- **WHEN** the mobile client requests mapping for the recipe
- **THEN** the response marks the ingredient as mapped and includes product id, product name, price where available, layout code where available, store scope where available, confidence, and manual confirmation state

#### Scenario: Multiple products match an ingredient
- **GIVEN** an ingredient such as milk has multiple plausible product candidates
- **WHEN** the backend builds mapping status
- **THEN** the response reports multiple candidates rather than selecting one silently unless an active confirmed mapping exists

#### Scenario: Synonym supports mapping
- **GIVEN** the synonym table relates `tomato`, `tomatoes`, and `Paradeiser` to the same canonical ingredient
- **WHEN** the backend proposes mappings for a matching ingredient
- **THEN** synonym matches can be used as suggestions but still require a clear confidence status or manual confirmation

### Requirement: Store context affects mapping availability
The recipe mapping response SHALL support optional store context so ingredient mappings can prefer products available in the selected or detected store.

#### Scenario: Store-scoped mapping exists
- **GIVEN** a recipe ingredient has mappings for multiple stores
- **WHEN** the mobile client requests `GET /api/mobile/recipes/{recipeId}/product-mapping?storeId=<storeId>`
- **THEN** the backend prefers the active mapping for that store when one exists

#### Scenario: Product is unavailable in selected store
- **GIVEN** a global mapping points to a product that cannot be found for the selected store context
- **WHEN** the mobile client requests recipe mapping for that store
- **THEN** the response marks the ingredient as unavailable or unmapped for the store instead of returning a misleading routable product

### Requirement: Mapping status is visible and non-routable states are explicit
The mobile recipe mapping response SHALL distinguish mapped ingredients from unmapped ingredients, multiple-candidate ingredients, unavailable products, and products without layout positions.

#### Scenario: Ingredient has no product mapping
- **GIVEN** a recipe ingredient has no active mapping and no accepted candidate
- **WHEN** the mobile client renders the add-to-shopping-list flow
- **THEN** the ingredient is shown as not mapped and is not presented as a routable product

#### Scenario: Product has no layout code
- **GIVEN** a mapped catalog product has no usable layout code
- **WHEN** the mobile client adds it from a recipe
- **THEN** the product may be shown on the list but the shopping tour treats it as unresolved

### Requirement: Recipe add-to-list uses local mobile shopping-list state
The MVP SHALL add recipe ingredients to the iOS shopping list client-side using existing local shopping-list behavior and SHALL NOT require backend customer shopping-list persistence.

#### Scenario: Recipe is added to shopping list
- **GIVEN** a published recipe has mapped and unmapped ingredients
- **WHEN** the customer confirms adding the recipe in the iOS app
- **THEN** mapped ingredients are converted into local shopping-list items and unmapped ingredients remain visible as unmapped/free ingredient entries or explicit not-added items according to the mobile shopping-list contract

#### Scenario: Backend add route is considered
- **GIVEN** the MVP has no server-side customer identity or shared shopping-list persistence
- **WHEN** a developer considers `POST /api/mobile/recipes/{recipeId}/add-to-shopping-list`
- **THEN** the route is out of MVP scope unless a future change defines customer identity, synchronization, privacy, and conflict handling

### Requirement: Recipe MVP scope is bounded
The recipe-shopping MVP SHALL support curated backend recipes, mobile list/search/detail, manual product mappings, visible unmapped ingredients, and reuse of existing shopping-tour routing for mapped products.

#### Scenario: Non-MVP feature is requested
- **GIVEN** recipe functionality is being implemented
- **WHEN** AI recipe generation, nutrition, allergens, personalized recommendations, ratings, or full automatic quantity optimization are requested
- **THEN** the work is treated as future scope requiring a separate OpenSpec change
