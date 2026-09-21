## ADDED Requirements

### Requirement: Product catalog supports bounded upsell candidate retrieval
The backend SHALL provide or reuse product catalog lookup behavior that can retrieve a bounded set of existing products for upsell candidate generation without assuming an undocumented product-by-category route.

#### Scenario: Candidate retrieval is requested
- **GIVEN** an upsell request identifies a checked product and optional store context
- **WHEN** the backend loads possible upsell candidates
- **THEN** it uses implemented product catalog/search behavior or explicitly added helper methods rather than inventing products or relying on an undocumented public endpoint

#### Scenario: Size limit is applied
- **GIVEN** the backend searches or scans catalog data for candidates
- **WHEN** candidate products are returned to the upsell ranking step
- **THEN** the candidate list is bounded by a configured maximum size

#### Scenario: Store filter is available
- **GIVEN** product documents include `storeId` or `storeCode`
- **WHEN** store context is present in the upsell request
- **THEN** candidate retrieval applies matching store filters where the OpenSearch index supports them

### Requirement: Product summaries expose suggestion-safe fields
The catalog-to-upsell boundary SHALL expose only product fields needed for suggestion display, validation, ranking, and routing compatibility.

#### Scenario: Product summary is built
- **GIVEN** a catalog product is selected as an upsell candidate
- **WHEN** the backend builds an AI candidate summary or mobile response product summary
- **THEN** it includes product id, name, price where available, layout code where available, store scope where available, and derived layout-position availability

#### Scenario: Unsupported product metadata is absent
- **GIVEN** the current product document has no brand, category name, or image URL field
- **WHEN** an upsell response is built
- **THEN** the backend leaves those fields absent or null instead of inventing metadata

#### Scenario: Category signal is needed
- **GIVEN** the current catalog provides layout code but no explicit category field
- **WHEN** the backend needs a coarse category signal for candidate ranking
- **THEN** it may derive a category code from the first layout-code segment and must treat invalid or missing layout codes as unknown category
