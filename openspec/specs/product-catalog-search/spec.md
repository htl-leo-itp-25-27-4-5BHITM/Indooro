# product-catalog-search Specification

## Purpose
Defines public product and category search behavior, OpenSearch-backed catalog expectations, product document location fields, layout-code semantics, store-aware search direction, and unsupported category-code route assumptions.
## Requirements
### Requirement: Product catalog routes are public customer routes
The system SHALL keep customer product and category lookup routes public unless a future OpenSpec change explicitly protects them.

#### Scenario: Anonymous client lists products
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** an anonymous client requests `/api/products`
- **THEN** the system processes the request without requiring Admin Platform login

#### Scenario: Anonymous client lists categories
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** an anonymous client requests `/api/categories`
- **THEN** the system processes the request without requiring Admin Platform login

### Requirement: Product documents include location mapping data
The system SHALL represent searchable products with enough data to display product information and map the product to a store layout location, including at least product id, name, price where available, and layout code where available.

#### Scenario: Product search result is shown in mobile app
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** a product appears in a search result
- **THEN** the client can display the product identity and use its layout code to locate the product in the store layout when the code is present

#### Scenario: Product lacks layout code
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** a product has no usable layout code
- **THEN** the client can still display the product but must not claim a precise shelf location from that product alone

### Requirement: Layout code format is documented
The system SHALL treat the documented product layout code as a structured slash-separated location code composed of category code, meter, shelf compartment (`fach`), and row/slot (`reihe`), for example `310/1/1/1`.

#### Scenario: Layout code is parsed by future routing work
- **GIVEN** a product has a layout code such as `310/2/3/1`
- **WHEN** a future change maps products to shelf targets
- **THEN** it can use the category code, meter, compartment, and row/slot portions of the layout code as the documented semantic parts

#### Scenario: Invalid layout code is encountered
- **GIVEN** a product contains a layout code that does not match `{categoryCode}/{meter}/{fach}/{reihe}`
- **WHEN** the system or client attempts precise location mapping
- **THEN** the precise location is treated as unresolved rather than inventing a shelf target

### Requirement: Product search uses OpenSearch-backed catalog data
The system SHALL use OpenSearch-backed product and category indexes for customer catalog lookup and search workflows.

#### Scenario: Product search is requested
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** a client searches products by text query
- **THEN** the backend queries the configured OpenSearch product index and returns matching product documents according to the implemented search contract

#### Scenario: Category list is requested
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** a client requests categories
- **THEN** the backend returns category data from the configured catalog/search source

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

### Requirement: Search quality improvements remain compatible with the catalog contract
The system SHALL allow future fuzzy, synonym, colloquial, and typo-tolerant search improvements without changing the public expectation that products are searchable anonymously and map back to product documents.

#### Scenario: User searches colloquial term
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** a future search change adds synonym or colloquial matching
- **THEN** the response still returns normal product documents usable by the existing mobile/catalog UI

#### Scenario: Ranking changes
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** a future change changes OpenSearch ranking
- **THEN** the change must preserve the documented response contract for product identity and location mapping

### Requirement: Category-code product lookup is not assumed
The system SHALL NOT treat a dedicated route for "products by category code" as available unless a future OpenSpec change adds or documents the route, request parameters, store scope, and response shape.

#### Scenario: Developer needs products for one category code
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** a future feature needs to fetch products by category code
- **THEN** the change must either use an existing documented search/filter contract or add a new OpenSpec requirement and implementation for that route

#### Scenario: User asks whether category-code lookup exists
- **GIVEN** the OpenSearch-backed catalog API is configured
- **WHEN** the implemented routes are reviewed
- **THEN** only documented product, product search, and category routes can be claimed as existing behavior

### Requirement: Product search supports bounded result sets
The product search API SHALL support a query string and result-size limit so customer clients can request a bounded set of matching products.

#### Scenario: Query is provided
- **GIVEN** OpenSearch is reachable and product data exists
- **WHEN** a client calls `/api/products/search?q=<term>&size=<limit>`
- **THEN** the backend returns at most the requested bounded result set according to the implemented search contract

#### Scenario: Query is missing
- **GIVEN** a client calls the search endpoint without a non-empty query
- **WHEN** the request is processed
- **THEN** the backend returns a bad-request response instead of running an unbounded search

### Requirement: Empty search results are explicit
The customer search workflow SHALL handle no-result searches explicitly and SHALL NOT invent product locations or category suggestions that are not returned by the backend.

#### Scenario: No product matches
- **GIVEN** the customer searches for a term with no indexed product match
- **WHEN** the backend returns an empty result set
- **THEN** the client shows a no-result state instead of selecting a false product target

#### Scenario: Alternative suggestions are added later
- **GIVEN** a future change adds category suggestions or synonyms for no-result searches
- **WHEN** that change is implemented
- **THEN** suggestions must be based on documented search/index data rather than hardcoded guesses

### Requirement: Search latency target is documented
The customer search experience SHALL target results within about 300 milliseconds under good network and OpenSearch conditions, while still handling slower or failed requests gracefully.

#### Scenario: Search is fast
- **GIVEN** the network and OpenSearch are healthy
- **WHEN** a customer searches for a product
- **THEN** results should appear quickly enough to feel near-instant in the mobile/customer UI

#### Scenario: Search is slow or unavailable
- **GIVEN** the request exceeds the expected latency or fails
- **WHEN** the client receives timeout/error behavior
- **THEN** the UI shows loading or error feedback without blocking already loaded map context

### Requirement: Category lookup by code is supported
The category API SHALL allow clients to list categories and fetch a category by category code, while product-by-category lookup remains separate unless explicitly added.

#### Scenario: Category exists
- **GIVEN** a category document with the requested category code exists
- **WHEN** a client calls `/api/categories/{categoryCode}`
- **THEN** the backend returns that category document

#### Scenario: Products by category are requested
- **GIVEN** a client needs all products for a category code
- **WHEN** no documented product-by-category endpoint exists
- **THEN** the change must add or reuse an explicit product search/filter contract before claiming support

### Requirement: Admin catalog shows product location readiness
The Admin Platform SHALL show whether catalog products have usable location metadata for the selected or target store while preserving the existing public product search contract.

#### Scenario: Admin reviews product list
- **WHEN** an `admin` reviews products in the redesigned catalog management UI
- **THEN** each product row or detail view indicates whether its layout code and store metadata are present, valid, unresolved, or non-routable

#### Scenario: Admin edits layout code
- **WHEN** an `admin` creates or updates a product layout code
- **THEN** the UI validates the documented layout-code shape where possible and warns when the product cannot be confidently mapped to a layout target

### Requirement: Admin product readiness does not change public search boundaries
The redesigned Admin Platform SHALL use product readiness indicators and admin validation without making anonymous customer product/category lookup require Admin Platform authentication.

#### Scenario: Anonymous customer searches products
- **WHEN** an anonymous customer calls existing public product or category routes after the admin redesign
- **THEN** those public routes remain available according to the existing product catalog search and admin authentication specs

### Requirement: Product search supports admin mapping selection metadata
Product search results used by recipe mapping suggestions SHALL include enough product identity and location metadata for an admin to distinguish products before confirming a mapping.

#### Scenario: Mapping suggestions are requested
- **WHEN** the Admin Recipe Mapping UI requests product suggestions for an ingredient search term
- **THEN** the backend returns bounded product results containing product id, name, price where available, layout code where available, store id where available, and store code where available

#### Scenario: Product names collide
- **WHEN** multiple product results share the same or similar name
- **THEN** the response includes product id and location/store metadata so the Admin UI can distinguish them

#### Scenario: Product has no layout code
- **WHEN** a product suggestion has no usable layout code
- **THEN** the response still includes the product identity and the Admin UI can mark it as not routable

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

### Requirement: Product records support optional internal derived classification
The backend SHALL support deriving internal product-domain and product-class signals from existing product catalog fields for recommendation support, diagnostics, tests, or future filtering workflows.

#### Scenario: Product has name and layout code
- **WHEN** the backend evaluates a product with name and layout code
- **THEN** it can derive internal classification signals without changing the public product response contract

#### Scenario: Product classification is unavailable
- **WHEN** product name and layout code are insufficient to derive a reliable class or domain
- **THEN** the backend treats the product as unknown for quality-sensitive workflows

#### Scenario: Public catalog response is returned
- **WHEN** a customer product endpoint returns product data
- **THEN** internal upsell classification fields are not required to appear in the public response

### Requirement: Product domains are normalized for internal support
The backend SHALL support normalizing products into broad internal domains such as food, drink, cleaning, laundry, paper-household, hygiene, cooking, baking, dairy, fruit, grain-breakfast, snack, and unknown where the current catalog permits reliable inference.

#### Scenario: Cleaning product is classified
- **WHEN** a product name contains cleaner, bathroom cleaner, shower cleaner, surface cleaner, or similar reliable terms
- **THEN** the backend classifies it into a cleaning-compatible domain

#### Scenario: Laundry product is classified
- **WHEN** a product name contains softener, detergent, laundry, or similar reliable terms
- **THEN** the backend classifies it into a laundry-compatible domain

#### Scenario: Fruit product is classified
- **WHEN** a product name or layout-code category reliably indicates apples, bananas, oranges, fruit, apple sauce, or similar fruit products
- **THEN** the backend classifies it into fruit-compatible product classes

#### Scenario: Ambiguous product is classified
- **WHEN** a product could belong to multiple domains or has insufficient signals
- **THEN** the backend uses unknown or the safer narrower class rather than a broad guessed domain

### Requirement: Product classes can group equivalent variants
The backend SHALL support deriving normalized product classes that group equivalent variants across brands, package sizes, and naming differences.

#### Scenario: Apple variants exist
- **WHEN** products include Gala apples, loose apples, organic apples, and budget apples
- **THEN** they share an apple product class for exclusion and repetition control

#### Scenario: Flour variants exist
- **WHEN** products include flour variants with different brands or prices
- **THEN** they share a flour product class for exclusion and repetition control

#### Scenario: Cleaner variants exist
- **WHEN** products include bathroom cleaner, shower cleaner, or all-purpose cleaner variants
- **THEN** they share a cleaning-product class or compatible subclass for recommendation rules

### Requirement: Classification remains internal unless explicitly exposed later
The backend SHALL NOT expose a new public product-class or product-domain API as part of upsell quality gating unless a future OpenSpec change defines that public contract.

#### Scenario: Mobile upsell uses classification
- **WHEN** the mobile upsell service or future recommender helpers use product domains and classes
- **THEN** they use internal derived signals and keep the existing mobile upsell response shape compatible

#### Scenario: Future client requests classifications
- **WHEN** a future feature needs classifications in public API responses
- **THEN** that feature must add or modify an OpenSpec requirement for the public response contract

