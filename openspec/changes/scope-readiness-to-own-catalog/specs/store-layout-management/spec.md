## ADDED Requirements

### Requirement: Readiness checks a store's own catalog and ignores the global catalog when one exists
The store readiness report SHALL treat a product as the store's own when its `storeId` equals the store UUID or its `storeCode` equals the store code. A product with neither field SHALL be a global catalog product. When the store has at least one own product, the report SHALL evaluate only the own products (shelf matching and duplicate product ids), SHALL NOT create `PRODUCT_NO_SHELF` or `DUPLICATE_PRODUCT_ID` findings from global products, and SHALL return the number of ignored global products as `counts.skippedGlobalProducts`. When the store has no own product, the report SHALL evaluate the global catalog as before and SHALL return `counts.skippedGlobalProducts` 0. `counts.products` SHALL be the number of products that were evaluated.

#### Scenario: Store with own products and a global catalog
- **GIVEN** a store with 2 own products that match a shelf and 5 global products that match no shelf, with ids that also occur among the own products
- **WHEN** the readiness report is evaluated
- **THEN** the report contains no `PRODUCT_NO_SHELF` and no `DUPLICATE_PRODUCT_ID` finding, `counts.products` is 2 and `counts.skippedGlobalProducts` is 5

#### Scenario: Store without own products
- **GIVEN** a store without own products and a global catalog with one product that matches no shelf and one id that occurs twice
- **WHEN** the readiness report is evaluated
- **THEN** the report contains `PRODUCT_NO_SHELF` and `DUPLICATE_PRODUCT_ID` for those products and `counts.skippedGlobalProducts` is 0

### Requirement: Readiness page radius starts at the store profile's radius
The admin readiness page SHALL request the report without a `radius` parameter on first load, so the server uses the default radius of the store's coverage profile, and SHALL show the radius of the report in the radius input. A radius the user typed or applied SHALL stay in the input and be sent with later requests until a report names a different coverage profile; the input SHALL then show the default radius of the new profile.

#### Scenario: Testroom store opens the page
- **GIVEN** a store with profile `testroom`
- **WHEN** the readiness page opens
- **THEN** the first request has no `radius` parameter and the input shows 10,0

#### Scenario: Manual radius and profile change
- **GIVEN** the page shows the profile `testroom` and the user applied 12,5
- **WHEN** a later report names the profile `market`
- **THEN** the next request has no `radius` parameter and the input shows 8,0
