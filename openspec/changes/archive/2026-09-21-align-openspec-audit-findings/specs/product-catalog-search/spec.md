## MODIFIED Requirements

### Requirement: Store-aware catalog data is preferred
The system SHALL preserve store identity in product catalog data where multi-store correctness matters, so search and navigation can return products for the selected or detected store. Store-specific product documents SHALL include explicit store scope such as `storeId`, `storeCode`, or an equivalent documented field before the system claims multi-store product-location correctness.

#### Scenario: Product exists in multiple stores
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** product catalog data contains the same product name in multiple stores
- **THEN** the search workflow can distinguish the store-specific product record or location through explicit store scope fields

#### Scenario: Mobile client has selected store
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** a mobile client searches after selecting or detecting a store
- **THEN** the search behavior can be scoped to the selected store when product documents and the route support store scoping

#### Scenario: Product document has no store scope
- **GIVEN** a product document contains only global id, name, price, and layout code fields
- **WHEN** a client searches in a multi-store context
- **THEN** the system treats the result as store-agnostic and must not claim the location is correct for every store
