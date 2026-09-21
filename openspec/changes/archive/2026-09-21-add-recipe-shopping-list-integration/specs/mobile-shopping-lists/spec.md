## ADDED Requirements

### Requirement: Recipe-sourced shopping items keep source metadata
The mobile app SHALL preserve optional recipe source metadata on shopping-list items added from recipes without requiring that metadata for normal product-added items.

#### Scenario: Mapped recipe ingredient is added
- **GIVEN** a recipe ingredient maps to a product
- **WHEN** the customer adds the recipe to a local shopping list
- **THEN** the created or updated shopping-list item stores product identity, product name, price where available, layout code where available, quantity, sourceRecipeId, sourceRecipeName, ingredientName, ingredientQuantity, ingredientUnit, mappingConfidence, and manuallyConfirmed where available

#### Scenario: Normal product is added
- **GIVEN** the customer adds a searched product outside the recipe flow
- **WHEN** the product is saved to the local shopping list
- **THEN** the item remains valid without recipe source metadata

### Requirement: Recipe add flow converts mapped ingredients through existing product list logic
The mobile app SHALL convert mapped recipe ingredients into normal local shopping-list products so existing shopping-tour grouping, layout resolution, and route ordering can process them.

#### Scenario: Mapped ingredients are confirmed
- **GIVEN** a recipe has mapped ingredients with product ids and layout codes
- **WHEN** the customer confirms adding mapped ingredients
- **THEN** the app adds them through the existing shopping-list manager path and they can be routed like other product list items

#### Scenario: Active shopping session exists
- **GIVEN** a shopping session is active for the selected list
- **WHEN** recipe ingredients are added to that list
- **THEN** the session snapshot is refreshed so new mapped products can appear in remaining stops

### Requirement: Unmapped recipe ingredients remain visible
The mobile app SHALL handle recipe ingredients without confirmed product mappings explicitly and SHALL NOT invent product ids, prices, layout codes, or shelf locations for them.

#### Scenario: Unmapped ingredient is shown before adding
- **GIVEN** a recipe contains an unmapped ingredient
- **WHEN** the add-to-shopping-list sheet is opened
- **THEN** the ingredient is shown with an unmapped status and clear indication that it will not produce a routable product unless added as a free entry

#### Scenario: Free ingredient entry is added
- **GIVEN** the customer chooses to keep an unmapped ingredient on the shopping list
- **WHEN** the app creates a local free ingredient entry
- **THEN** the entry has no product id and no layout code, preserves ingredient quantity/unit/source metadata, and appears as unresolved in shopping-tour context

#### Scenario: Unmapped ingredient is skipped
- **GIVEN** the customer does not want to add an unmapped ingredient
- **WHEN** the recipe is added to the list
- **THEN** the ingredient is excluded from shopping-list items while remaining visible in the recipe add summary

### Requirement: Recipe-sourced duplicates are merged conservatively
The mobile app SHALL avoid uncontrolled duplicate open items when a recipe adds products already present on the selected local shopping list.

#### Scenario: Same open product exists
- **GIVEN** the selected list already contains an open item with the same product id and layout code
- **WHEN** a recipe adds that mapped product again
- **THEN** the app updates the existing open item quantity or note/source metadata instead of adding an uncontrolled duplicate row

#### Scenario: Same ingredient appears in multiple recipes
- **GIVEN** two recipes add ingredients that map to the same product
- **WHEN** both recipes are added to the same list
- **THEN** the local list preserves enough source or note metadata for the customer to understand the recipe origin while still keeping one open product item where merge rules apply

#### Scenario: Completed product exists
- **GIVEN** the selected list contains a completed item for the same product
- **WHEN** a recipe adds that product
- **THEN** the app creates or reopens an appropriate open item rather than treating the completed purchase as satisfying the new recipe need

### Requirement: Recipe quantity and package quantity are not automatically optimized
The mobile app SHALL preserve recipe amounts separately from shopping-list item quantity and SHALL NOT claim exact package optimization unless explicit mapping data supports it.

#### Scenario: Eggs map to a carton
- **GIVEN** a recipe ingredient says `2 eggs` and maps to a `10 eggs` product
- **WHEN** the ingredient is added to the shopping list
- **THEN** the shopping-list item defaults to a conservative package quantity such as 1 and preserves `2 eggs` in recipe metadata or note text

#### Scenario: Flour maps to one kilogram package
- **GIVEN** a recipe ingredient says `250 g flour` and maps to a `1 kg flour` product
- **WHEN** the ingredient is added to the shopping list
- **THEN** the app does not convert the shopping-list item to a fractional package quantity

### Requirement: Recipe-sourced unresolved items do not break navigation
The shopping route snapshot SHALL continue to separate unresolved items from routable stops when recipe-sourced items lack a product, layout code, or matching shelf element.

#### Scenario: Free ingredient has no layout
- **GIVEN** a local shopping list contains a free recipe ingredient entry
- **WHEN** the app builds the shopping route snapshot
- **THEN** the free entry appears in unresolved items and no route stop is invented

#### Scenario: Mapped product lacks shelf match
- **GIVEN** a mapped recipe product has a layout code that does not resolve in the active layout
- **WHEN** the app builds the shopping route snapshot
- **THEN** the item appears unresolved and the rest of the shopping tour remains usable
