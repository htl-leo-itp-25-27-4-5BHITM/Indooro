## ADDED Requirements

### Requirement: Recipe product mappings are catalog-backed
Recipe ingredient product mappings SHALL be anchored to existing product catalog documents through product ids and SHALL NOT depend on arbitrary client-supplied product names or layout codes.

#### Scenario: Mapping is confirmed from Admin UI
- **WHEN** an admin confirms a recipe ingredient mapping to a product
- **THEN** the backend verifies the product id against the catalog and snapshots product name, price, layout code, store id, and store code from the resolved product where available

#### Scenario: Catalog product is missing
- **WHEN** the backend cannot resolve the submitted product id from the catalog
- **THEN** the mapping is rejected and mobile recipe mapping responses do not expose a false mapped product

#### Scenario: Mobile mapping response reads confirmed mapping
- **WHEN** a mobile client requests recipe product mapping after an admin confirmed a catalog-backed mapping
- **THEN** the response marks the ingredient as mapped or product-without-layout according to the resolved product data and includes the product id and snapshot fields needed by the mobile app
