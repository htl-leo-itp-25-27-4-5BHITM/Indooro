## ADDED Requirements

### Requirement: Upsell plan ranking must be AI-first
The backend SHALL let OpenAI choose add-on products for shopping-session upsell plans from a bounded shared store catalog.

#### Scenario: Plan request is prepared
- **WHEN** the mobile app sends a valid upsell plan request
- **THEN** the backend builds a shared `candidateProducts` list for the store
- **AND** the backend sends the opportunities and the shared candidate list to OpenAI

#### Scenario: Candidate product is already part of the shopping state
- **WHEN** a product is currently open on the list, already completed, or used as a trigger product
- **THEN** the backend excludes that product ID from the AI candidate catalog

#### Scenario: Candidate pool is bounded
- **WHEN** the backend loads products for an AI upsell plan
- **THEN** the candidate list is capped by the configured `upsell.max-candidates` value

#### Scenario: Catalog contains an equivalent product variant
- **WHEN** a candidate is the same product type as a trigger in another brand, package size, flavor, or variant
- **THEN** the OpenAI ranking prompt instructs the model not to select it as an add-on
- **AND** the model may return an empty suggestions array when no genuine complement exists

### Requirement: Backend must validate OpenAI product IDs
The backend SHALL treat OpenAI output as ranking advice and validate every returned identifier against the server-side candidate map.

#### Scenario: OpenAI returns a known candidate ID
- **WHEN** OpenAI returns a `productId` that exists in the request candidate map
- **THEN** the backend may return that product as a suggestion if confidence and response limits allow it

#### Scenario: OpenAI returns an unknown product ID
- **WHEN** OpenAI returns a `productId` that was not in `candidateProducts`
- **THEN** the backend discards that suggestion

#### Scenario: OpenAI returns duplicate product IDs
- **WHEN** OpenAI returns the same `productId` more than once for one opportunity
- **THEN** the backend keeps at most the first valid occurrence

#### Scenario: OpenAI returns an unknown opportunity ID
- **WHEN** OpenAI returns an `opportunityId` that was not in the request
- **THEN** the backend ignores that opportunity result

### Requirement: Plan fallback must not invent deterministic suggestions
The backend SHALL return empty plan suggestions when OpenAI is unavailable, invalid, disabled, or timed out.

#### Scenario: OpenAI times out
- **WHEN** the OpenAI plan request exceeds the backend timeout
- **THEN** the backend returns the requested opportunities with empty `suggestions` arrays
- **AND** the response source is `none` or equivalent no-suggestion source

#### Scenario: OpenAI is disabled
- **WHEN** OpenAI plan ranking is disabled or no API key is configured
- **THEN** the backend returns empty `suggestions` arrays instead of deterministic semantic fallback suggestions

#### Scenario: OpenAI returns invalid JSON
- **WHEN** the OpenAI response cannot be parsed into the structured schema
- **THEN** the backend returns empty `suggestions` arrays instead of deterministic semantic fallback suggestions

### Requirement: Client must avoid duplicate in-flight AI plan requests
iOS SHALL NOT cancel a running upsell plan request and start another plan request for routine shopping-list progress changes.

#### Scenario: Plan request is already running
- **WHEN** `preloadPlan` is called while a previous plan request is still in flight
- **THEN** iOS skips the new request
- **AND** logs `preloadPlan skipped reason=in_flight_waiting` or equivalent

#### Scenario: Plan request is slow but still valid
- **WHEN** the backend needs longer than six seconds to return an OpenAI-ranked plan
- **THEN** iOS waits long enough for the configured plan request timeout before treating it as failed

#### Scenario: Customer completes station while plan is loading
- **WHEN** the customer completes an opportunity before the plan response arrives
- **THEN** iOS stores a pending opportunity and retries display only if that exact opportunity later receives suggestions

### Requirement: iOS cache must distinguish missing, empty, and populated opportunities
iOS SHALL represent upsell plan cache entries with explicit states for not loaded, loaded empty, and loaded with suggestions.

#### Scenario: Empty response is cached
- **WHEN** the backend returns an opportunity with an empty suggestion list
- **THEN** iOS stores a loaded-empty cache entry for that opportunity until the plan expiration or session reset

#### Scenario: Loaded-empty opportunity is completed
- **WHEN** the customer completes an opportunity with a loaded-empty cache entry
- **THEN** iOS logs `no_suggestions` or equivalent and does not store a pending opportunity

#### Scenario: Cache entry source differs
- **WHEN** an otherwise matching opportunity is cached for `shopping_session` but later checked with `shopping_list` source
- **THEN** iOS either normalizes the source for cache lookup or checks the equivalent session/list cache key before declaring a cache miss

### Requirement: Upsell debug output must support cost and timing evaluation
The implementation SHALL expose enough debug information to determine whether the AI plan was slow, duplicated, cached, empty, or token-heavy.

#### Scenario: OpenAI succeeds
- **WHEN** the backend receives a valid OpenAI response
- **THEN** the response debug data includes elapsed time, OpenAI elapsed time, model, source, candidate count, and token usage when available

#### Scenario: iOS receives plan response
- **WHEN** iOS decodes a plan response
- **THEN** iOS logs request ID, source, elapsed/token debug summary, and per-opportunity suggestion IDs

#### Scenario: Empty opportunity is used later
- **WHEN** iOS later checks a loaded-empty opportunity
- **THEN** iOS logs `no_suggestions` instead of `cache_miss`
