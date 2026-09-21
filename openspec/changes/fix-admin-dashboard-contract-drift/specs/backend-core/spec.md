## ADDED Requirements

### Requirement: Recipe updates keep tag assignments unless tags are sent
`PUT /api/admin/recipes/{recipeId}` SHALL keep the existing tag assignments when `tagIds` is `null` or absent, SHALL replace them when `tagIds` is an array, and SHALL remove all assignments only when `tagIds` is an empty array.

#### Scenario: Update without tagIds
- **GIVEN** a recipe with tags `vegetarisch` and `schnell`
- **WHEN** an admin updates the title without the `tagIds` field
- **THEN** the recipe keeps both tags

#### Scenario: Update with an empty tag list
- **GIVEN** a recipe with two tags
- **WHEN** an admin updates it with `"tagIds": []`
- **THEN** the recipe has no tags

### Requirement: Recipe summaries report step counts
Recipe summary responses SHALL include `stepCount` with the number of preparation steps.

#### Scenario: Admin lists recipes
- **GIVEN** a recipe with four steps
- **WHEN** `GET /api/admin/recipes` is called
- **THEN** its summary contains `"stepCount": 4`

#### Scenario: Mobile lists recipes
- **GIVEN** a published recipe with two steps
- **WHEN** `GET /api/mobile/recipes` is called
- **THEN** its summary contains `"stepCount": 2` and existing fields are unchanged

### Requirement: Admin product list supports paging and search
`GET /api/admin/products` SHALL accept `page`, `size` (1 to 100), and `q`, and SHALL return a `PageResponse` of products with the OpenSearch total hit count when `page` is present. Store lists SHALL accept the boolean filter `hasActiveLayout`.

#### Scenario: Admin searches products
- **GIVEN** 1 500 indexed products
- **WHEN** an admin calls `GET /api/admin/products?page=2&size=50&q=milch`
- **THEN** the response contains at most 50 matching products and `totalElements` equals the number of matches

#### Scenario: Stores without layout are requested
- **GIVEN** 10 stores, 3 without an active layout
- **WHEN** an admin calls `GET /api/stores?hasActiveLayout=false`
- **THEN** the response contains the 3 stores and `totalElements` is 3
