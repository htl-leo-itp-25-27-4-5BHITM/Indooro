## ADDED Requirements

### Requirement: Admin recipe ingredient mappings use catalog product selection
The Admin Platform SHALL let admins map a recipe ingredient by searching and selecting an existing catalog product instead of entering arbitrary product text.

#### Scenario: Admin searches products for an ingredient
- **WHEN** an admin enters a product search term of at least two characters in a recipe ingredient mapping control
- **THEN** the Admin UI queries the protected recipe mapping suggestions API with the ingredient context and displays bounded matching catalog products

#### Scenario: Product option is displayed
- **WHEN** product search results are shown for a recipe ingredient
- **THEN** each option shows the product id, product name, price where available, layout code where available, store identity where available, and whether the product is routable

#### Scenario: Product is selected
- **WHEN** an admin selects a product option for an ingredient
- **THEN** the selected product remains visible as the pending mapping choice and can be changed or cleared before saving

### Requirement: Mapping search control exposes operational states
The recipe mapping product selector SHALL provide loading, empty, error, and selected states that fit the existing Admin Platform UI.

#### Scenario: Search is loading
- **WHEN** a product search request is in flight
- **THEN** the ingredient mapping panel shows a loading state without saving a mapping

#### Scenario: Search returns no products
- **WHEN** the mapping search API returns an empty result set
- **THEN** the selector shows an empty state and does not allow saving arbitrary text as a mapping

#### Scenario: Search fails
- **WHEN** the mapping search request fails
- **THEN** the selector shows an error state and keeps any previous confirmed mapping unchanged

### Requirement: Mapping confirmation uses product id as source of truth
Recipe ingredient mapping confirmation SHALL persist mappings based on a selected `productId` that the backend verifies against the catalog.

#### Scenario: Admin confirms selected product
- **WHEN** an admin saves a selected product for a recipe ingredient
- **THEN** the request contains the selected product id and does not rely on client-supplied product name or layout code for persistence

#### Scenario: Unknown product is submitted
- **WHEN** a mapping confirmation references a product id that does not exist in the product catalog
- **THEN** the backend rejects the mapping and does not persist a recipe ingredient product mapping

#### Scenario: Product lacks layout code
- **WHEN** the selected catalog product has no usable layout code
- **THEN** the backend may persist the mapping and the Admin UI shows that the product is not routable

### Requirement: Mapping save refreshes recipe mapping state
The Admin UI SHALL refresh mapping status after a successful product mapping confirmation.

#### Scenario: Mapping is saved
- **WHEN** the backend accepts a recipe ingredient product mapping
- **THEN** the mapping drawer reloads or re-renders mapping status so the ingredient reflects the confirmed product and current status

#### Scenario: Duplicate active mapping is submitted
- **WHEN** the backend rejects a duplicate active mapping with conflict
- **THEN** the Admin UI shows the error and does not display the duplicate as newly saved
