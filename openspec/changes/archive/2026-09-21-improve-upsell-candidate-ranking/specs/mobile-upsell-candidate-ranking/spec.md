## ADDED Requirements

### Requirement: Upsell candidates are ranked per opportunity before AI
The backend SHALL compute a bounded ranked candidate set for each upsell opportunity before OpenAI is called.

#### Scenario: Station opportunity is ranked independently
- **WHEN** the backend receives a plan request containing multiple station opportunities
- **THEN** it computes candidate scores separately for each opportunity using that opportunity's trigger products and names

#### Scenario: Candidate pool is bounded per opportunity
- **WHEN** ranked candidates are prepared for an opportunity
- **THEN** the backend sends no more than the configured per-opportunity candidate limit to the AI ranking step

#### Scenario: Global broad pool is not sent directly
- **WHEN** the backend loads a broad catalog or store-scoped product pool
- **THEN** it filters and scores that pool before exposing candidates to OpenAI

### Requirement: Candidate ranking uses catalog-derived relevance signals
The backend SHALL rank candidates using only existing catalog data and documented derived signals, including product id, name, layout-code category, store scope, and layout-position availability.

#### Scenario: Category complement exists
- **WHEN** a candidate category is configured as a complement for a trigger category
- **THEN** the candidate receives a higher deterministic score for that opportunity

#### Scenario: Product keyword complement exists
- **WHEN** a trigger name and candidate name match a configured complement keyword rule
- **THEN** the candidate receives a higher deterministic score for that opportunity

#### Scenario: Candidate belongs to current store
- **WHEN** the request includes current store context and a candidate product matches that store
- **THEN** the candidate receives a higher deterministic score than otherwise equivalent non-store candidates

#### Scenario: Candidate has layout position
- **WHEN** a candidate has a usable layout code
- **THEN** the candidate may receive a higher deterministic score so accepted suggestions remain useful for route planning

### Requirement: Candidate ranking applies hard exclusions
The backend SHALL exclude invalid or inappropriate products before AI and fallback ranking.

#### Scenario: Candidate is already open on the shopping list
- **WHEN** a candidate product id appears in `currentListProductIds`
- **THEN** the backend excludes it from every opportunity candidate set

#### Scenario: Candidate is already completed
- **WHEN** a candidate product id appears in `completedProductIds`
- **THEN** the backend excludes it from every opportunity candidate set

#### Scenario: Candidate is a trigger product
- **WHEN** a candidate product id appears in the opportunity's `triggerProductIds`
- **THEN** the backend excludes it from that opportunity candidate set

#### Scenario: Candidate lacks required identity
- **WHEN** a candidate product has no id or no non-empty name
- **THEN** the backend excludes it from AI and fallback ranking

### Requirement: Weak or confusing complements are penalized
The backend SHALL reduce the score of candidates that are likely alternatives, duplicates, or weak meal-association guesses rather than practical add-ons.

#### Scenario: Candidate is an alternative version of the trigger
- **WHEN** a candidate name appears to be the same product class as the trigger and no rule allows alternatives for that class
- **THEN** the backend lowers or removes that candidate from the opportunity candidate set

#### Scenario: Butter has better direct complements
- **WHEN** a butter-like trigger has bread, breakfast, dairy, or baking candidates available
- **THEN** pasta and tomato-sauce candidates are ranked below those direct complements

#### Scenario: Pasta has sauce complements
- **WHEN** a pasta-like trigger has sauce or tomato candidates available
- **THEN** unrelated breakfast or fruit candidates are ranked below those direct complements

### Requirement: OpenAI receives minimal per-opportunity candidate payloads
The backend SHALL send OpenAI only minimal per-opportunity candidate data needed for ranking and reason generation.

#### Scenario: OpenAI plan request is built
- **WHEN** the backend builds the OpenAI payload for `/api/mobile/upsell/plan`
- **THEN** each opportunity includes only its opportunity id, trigger summary, and bounded candidate product summaries

#### Scenario: Candidate summary is serialized for AI
- **WHEN** a candidate product is included in the OpenAI payload
- **THEN** the payload includes product id, name, and derived category code, and omits unavailable or unnecessary mobile response fields

#### Scenario: Structured output is enforced
- **WHEN** OpenAI ranks per-opportunity candidates
- **THEN** the backend requires structured JSON containing only known opportunity ids, candidate product ids, reasons, and confidence values

### Requirement: AI output remains fully validated
The backend SHALL validate AI output against the opportunity-specific candidate sets before returning mobile suggestions.

#### Scenario: AI returns candidate from another opportunity
- **WHEN** OpenAI returns a product id that is valid globally but not in the returned opportunity's candidate set
- **THEN** the backend discards that suggestion for that opportunity

#### Scenario: AI returns unknown opportunity id
- **WHEN** OpenAI returns an opportunity id that was not requested
- **THEN** the backend ignores that opportunity output

#### Scenario: AI returns low-confidence suggestion
- **WHEN** OpenAI returns a suggestion below the configured confidence threshold
- **THEN** the backend omits it from the mobile response

### Requirement: Fallback ranking is opportunity-specific
When OpenAI is disabled, unconfigured, slow, invalid, or unavailable, the backend SHALL return fallback suggestions from each opportunity's deterministic ranked candidate set.

#### Scenario: OpenAI times out
- **WHEN** the OpenAI plan request exceeds the configured timeout
- **THEN** each opportunity receives fallback suggestions from its own ranked candidate set or an empty suggestion list

#### Scenario: OpenAI is disabled
- **WHEN** OpenAI ranking is disabled by configuration
- **THEN** the backend still uses deterministic per-opportunity candidate ranking for fallback suggestions

#### Scenario: Opportunity has no strong candidates
- **WHEN** deterministic ranking finds no candidate above the configured quality threshold for an opportunity
- **THEN** the backend returns no suggestions for that opportunity instead of filling weak suggestions

### Requirement: Backend supports skipping AI for high-confidence deterministic opportunities
The backend SHALL support a configurable path for returning deterministic suggestions without an OpenAI call when candidate scores are sufficiently strong and unambiguous according to configured thresholds.

#### Scenario: Deterministic candidates are strong
- **WHEN** an opportunity has enough candidates above the configured deterministic auto-accept threshold
- **THEN** the backend may return those candidates with a non-OpenAI source without calling OpenAI

#### Scenario: Deterministic candidates are ambiguous
- **WHEN** an opportunity has mixed or low-margin candidate scores and OpenAI is enabled
- **THEN** the backend may use OpenAI to rerank and explain the bounded candidate set

### Requirement: Token and latency budgets are explicit
The upsell plan ranking path SHALL enforce configurable limits that prevent OpenAI payloads from growing with the full product catalog.

#### Scenario: Many route stations exist
- **WHEN** a plan request contains many opportunities
- **THEN** the backend caps opportunities and candidates according to configured request limits before calling OpenAI

#### Scenario: Many catalog candidates exist
- **WHEN** OpenSearch returns more products than the configured candidate pool size
- **THEN** the backend limits the broad pool and then further limits per-opportunity candidates

#### Scenario: Debug data is returned
- **WHEN** a plan response includes debug metadata
- **THEN** it exposes enough source, elapsed time, candidate count, and token data to confirm whether token-saving behavior is working without exposing secrets

### Requirement: Candidate quality is covered by repeatable tests
The implementation SHALL include backend tests or fixtures that verify candidate ranking behavior for representative product types.

#### Scenario: Butter fixture is evaluated
- **WHEN** the ranking tests evaluate a butter-like trigger with bread, baking, dairy, pasta, and sauce candidates
- **THEN** direct bread, baking, dairy, or breakfast complements rank above pasta or sauce

#### Scenario: Pasta fixture is evaluated
- **WHEN** the ranking tests evaluate a pasta-like trigger with sauce and unrelated candidates
- **THEN** sauce or tomato candidates rank above unrelated candidates

#### Scenario: Fruit fixture is evaluated
- **WHEN** the ranking tests evaluate a fruit-like trigger with yogurt, oats, and unrelated candidates
- **THEN** yogurt, oats, or breakfast complements rank above unrelated candidates

#### Scenario: Unknown category fixture is evaluated
- **WHEN** the ranking tests evaluate a trigger with unknown category and no keyword rule
- **THEN** the backend returns safe store-aware/layout-backed candidates or no suggestions without inventing relations

### Requirement: Mobile behavior remains compatible
The backend SHALL preserve the existing mobile `/api/mobile/upsell/plan` response contract used by the iOS app.

#### Scenario: iOS receives ranked plan response
- **WHEN** the iOS app decodes a plan response after candidate-ranking changes
- **THEN** existing Swift models can still decode opportunities, source, expiration, suggestions, and debug data

#### Scenario: Station is checked off before plan response
- **WHEN** the customer completes a station before the plan response arrives
- **THEN** the existing PendingOpportunity retry behavior can still show the validated suggestion after the response is cached

#### Scenario: Suggested product is added
- **WHEN** the customer adds a suggestion generated by the improved ranking path
- **THEN** the product still uses the existing `addedFromUpsell` list-add path and remains excluded as a future trigger
