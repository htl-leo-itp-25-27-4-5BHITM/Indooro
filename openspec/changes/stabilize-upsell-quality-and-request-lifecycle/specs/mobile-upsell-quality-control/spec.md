## ADDED Requirements

### Requirement: Upsell semantic ranking remains AI-first
The backend SHALL continue to send OpenAI a bounded shared store catalog after applying only catalog-validity and shopping-state exclusions, and SHALL NOT use broad deterministic complement rules to decide which candidates OpenAI may consider.

#### Scenario: Plan candidates are prepared
- **WHEN** a valid plan request has available catalog candidates
- **THEN** the backend sends the bounded candidate catalog to OpenAI before applying equivalent-product output validation

#### Scenario: Candidate has unknown semantic class
- **WHEN** a valid catalog candidate cannot be assigned a strong equivalent-product class
- **THEN** the backend keeps the candidate available to OpenAI instead of rejecting it through a guessed category relationship

### Requirement: Obvious alternatives are rejected after AI ranking
The backend SHALL reject an AI-selected product when strong normalized evidence shows that it is the same product type as any trigger in that opportunity, including another brand, package size, flavor, spelling variant, or known synonym.

#### Scenario: Apple variant is returned for apples
- **WHEN** an opportunity triggered by apples receives another fresh-apple product ID from OpenAI
- **THEN** the backend removes that suggestion before returning the mobile response

#### Scenario: Kitchen paper synonym is returned for kitchen roll
- **WHEN** an opportunity triggered by kitchen roll receives kitchen paper or another kitchen-roll package variant
- **THEN** the backend removes that suggestion before returning the mobile response

#### Scenario: Toothpaste variant is returned for toothpaste
- **WHEN** a station includes toothpaste as a trigger and OpenAI returns another toothpaste product
- **THEN** the backend removes that suggestion even when the brand, package size, or catalog ID differs

#### Scenario: Genuine complement shares a broad department
- **WHEN** a candidate is in the same broad department as a trigger but is not an equivalent product class
- **THEN** the backend does not reject it solely because of category code, shelf, department, or domain similarity

#### Scenario: Risotto receives butter
- **WHEN** an opportunity triggered by risotto receives butter from OpenAI
- **THEN** the backend may keep the suggestion because butter is a complement rather than a risotto variant

### Requirement: Suggestions within one opportunity are diverse
The backend SHALL return at most one suggestion from the same strong equivalent-product class within one opportunity.

#### Scenario: Multiple butter variants are returned
- **WHEN** OpenAI returns two or more butter products for the same opportunity
- **THEN** the backend keeps only the first valid highest-ranked butter suggestion

#### Scenario: Different complement classes are returned
- **WHEN** OpenAI returns valid suggestions from distinct product classes
- **THEN** the backend preserves their AI order up to the configured suggestion limit

#### Scenario: Diversity filtering removes every suggestion
- **WHEN** all AI suggestions are rejected as trigger equivalents, duplicates, low confidence, or unknown IDs
- **THEN** the backend returns an empty suggestion array rather than inventing a replacement

### Requirement: The OpenAI prompt describes complement quality explicitly
The plan prompt SHALL define complements as products that support a distinct use case with the trigger, SHALL prefer fewer or empty suggestions over substitutes, and SHALL include concise positive and negative examples.

#### Scenario: Prompt is constructed
- **WHEN** the backend builds an OpenAI plan request
- **THEN** the system prompt includes negative examples for apples-to-apples, kitchen-roll-to-kitchen-paper, and toothpaste-to-toothpaste
- **AND** it includes a positive example such as risotto-to-butter or eggs-to-flour

#### Scenario: No clear complement exists
- **WHEN** OpenAI determines that no candidate is a strong complement
- **THEN** the structured response may contain an empty suggestions array for that opportunity

### Requirement: Handled opportunities are idempotent within one shopping session
The iOS app SHALL track opportunity lifecycle state and SHALL NOT plan or display the same handled opportunity again until the upsell shopping session is reset or the opportunity identity materially changes.

#### Scenario: Prompt was shown and dismissed
- **WHEN** the same opportunity appears again after its prompt was dismissed
- **THEN** iOS excludes it from new plan requests and does not display it again in that session

#### Scenario: Suggestion was accepted
- **WHEN** the customer accepts a suggestion for an opportunity
- **THEN** iOS marks the opportunity handled and prevents another plan or prompt for it in that session

#### Scenario: AI returned an intentional empty result
- **WHEN** a successfully evaluated OpenAI opportunity is completed with no suggestions
- **THEN** iOS marks that opportunity handled and does not request it again in the same session

#### Scenario: Item status is toggled after completion
- **WHEN** a handled product is reopened and completed again without a session reset
- **THEN** iOS does not create another OpenAI-backed request for the same opportunity identity

#### Scenario: Station composition materially changes
- **WHEN** a station receives a different normalized set of eligible trigger product IDs
- **THEN** iOS treats the changed station signature as a new opportunity identity while preserving the handled state of the previous signature

#### Scenario: Shopping session resets
- **WHEN** `resetSession()` runs or a different store is explicitly authorized
- **THEN** iOS clears handled opportunity lifecycle state for the previous session

### Requirement: Upsell request shopping state is canonical
The iOS app SHALL build deterministic, deduplicated, sorted, and disjoint current and completed product ID sets before computing a plan signature or request body.

#### Scenario: Product ID appears in open and completed source collections
- **WHEN** local list/session projections contain the same product ID in both collections
- **THEN** iOS keeps the ID in the current/open set and removes it from the completed set for the upsell request

#### Scenario: Product IDs are duplicated
- **WHEN** the same product ID appears multiple times in a source collection
- **THEN** the request and plan signature contain that ID once in deterministic order

#### Scenario: Status-only callback repeats
- **WHEN** repeated callbacks produce the same canonical shopping state and opportunity set
- **THEN** they produce the same plan signature and do not start a new request

### Requirement: Candidate lookup failures are distinct from valid empty results
The backend SHALL distinguish a successful candidate lookup that yields no eligible products from an OpenSearch lookup failure and SHALL NOT store a transient lookup failure as a normal long-lived empty plan.

#### Scenario: OpenSearch throws during candidate lookup
- **WHEN** scoped or fallback candidate retrieval fails with an I/O or availability error before OpenAI is called
- **THEN** the backend returns empty opportunities with a distinct retryable failure reason
- **AND** reports zero OpenAI tokens
- **AND** does not write the normal long-lived plan cache entry

#### Scenario: Candidate lookup succeeds but filtering removes all products
- **WHEN** catalog retrieval succeeds and no eligible products remain after contract exclusions
- **THEN** the backend returns a non-retryable `no_candidates` result that may be cached as a genuine empty plan

#### Scenario: OpenAI intentionally returns empty suggestions
- **WHEN** OpenAI successfully evaluates the candidate catalog and returns empty arrays
- **THEN** the backend treats the response as a successful non-retryable AI result and may cache it normally

### Requirement: Transient plan retry is bounded and token-safe
The iOS app SHALL retry a plan at most once for the same signature when the backend explicitly reports a retryable pre-OpenAI candidate failure, and SHALL NOT retry successful AI-empty, filtered-empty, timeout, or already handled outcomes automatically.

#### Scenario: Retryable candidate failure is received
- **WHEN** the backend reports a retryable candidate lookup failure with no OpenAI token usage
- **THEN** iOS waits for the configured short retry delay and issues at most one retry for the unchanged plan signature

#### Scenario: Retry succeeds
- **WHEN** the one bounded retry returns valid suggestions
- **THEN** iOS caches them normally and clears retry state for that signature

#### Scenario: Retry fails again
- **WHEN** the bounded retry returns another retryable failure
- **THEN** iOS stops retrying and leaves shopping completion non-blocking

#### Scenario: OpenAI has already been called
- **WHEN** a response reports OpenAI timing or token usage, or a normal AI outcome source
- **THEN** iOS does not automatically retry that plan response

### Requirement: Quality and cost decisions are observable
Backend and iOS debug output SHALL expose enough non-sensitive data to verify equivalent suppression, diversity suppression, handled-opportunity suppression, candidate lookup failure, retry count, request count, and token usage.

#### Scenario: Equivalent suggestion is removed
- **WHEN** post-AI validation removes a product equivalent to a trigger
- **THEN** backend logs include request ID, opportunity ID, product ID, normalized class, and `reason=trigger_equivalent`

#### Scenario: Same-class suggestion is deduplicated
- **WHEN** diversity validation removes a lower-ranked product class duplicate
- **THEN** backend logs include `reason=duplicate_suggestion_class` and the retained product ID

#### Scenario: Handled opportunity is considered for preload
- **WHEN** iOS encounters an opportunity already handled in the session
- **THEN** it logs `reason=handled_opportunity` without issuing a network request

#### Scenario: Automatic retry occurs
- **WHEN** iOS retries a candidate lookup failure
- **THEN** logs identify the original signature, retry attempt number, delay, and resulting backend request ID

#### Scenario: Debug response is returned
- **WHEN** a plan response is generated
- **THEN** debug data continues to report source, timings, candidate count, token usage, and a non-sensitive outcome or failure reason
