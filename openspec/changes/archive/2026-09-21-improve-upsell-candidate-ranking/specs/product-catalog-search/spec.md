## ADDED Requirements

### Requirement: Backend catalog helpers support category-aware candidate retrieval
The backend SHALL support internal catalog lookup helpers that can retrieve bounded candidate products using store scope and layout-code category signals without exposing a new public product-by-category route.

#### Scenario: Internal upsell candidate lookup requests category signals
- **WHEN** the upsell service needs products related to a trigger category
- **THEN** it can use internal OpenSearch helper behavior to retrieve bounded store-aware candidates suitable for scoring

#### Scenario: No public category-product route is added
- **WHEN** category-aware candidate retrieval is implemented for upsell
- **THEN** anonymous public product routes remain unchanged unless a separate OpenSpec change adds a public endpoint

#### Scenario: Layout code category is invalid
- **WHEN** a product has no usable layout-code category segment
- **THEN** internal candidate retrieval treats the category as unknown rather than inventing category metadata

### Requirement: Candidate retrieval remains bounded before scoring
Internal catalog candidate lookup for upsell SHALL cap result sizes before downstream scoring and AI ranking.

#### Scenario: OpenSearch index contains many products
- **WHEN** the backend loads possible upsell candidates
- **THEN** the catalog helper returns no more than the configured broad candidate limit

#### Scenario: Store-scoped result is too small
- **WHEN** store-scoped lookup returns too few candidates for useful ranking
- **THEN** the backend may merge a bounded non-store fallback pool while preserving store-scoped candidates' ranking advantage

#### Scenario: Candidate retrieval fails
- **WHEN** OpenSearch candidate lookup fails
- **THEN** the upsell service receives an empty candidate list and does not fabricate products

### Requirement: Catalog candidate summaries remain grounded in product documents
Candidate retrieval and scoring SHALL use product fields actually present in catalog documents or deterministic derivations from those fields.

#### Scenario: Candidate summary needs a category
- **WHEN** the upsell ranking path needs a category signal
- **THEN** it derives the category code from the first layout-code segment or marks the category unknown

#### Scenario: Candidate summary needs store context
- **WHEN** the upsell ranking path needs store context
- **THEN** it uses the product document's `storeId` or `storeCode` fields where present

#### Scenario: Candidate summary lacks rich metadata
- **WHEN** brand, image URL, inventory, popularity, or margin fields are absent from the product document
- **THEN** the backend does not invent those fields for ranking or AI payloads
