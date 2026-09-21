## ADDED Requirements

### Requirement: Mobile upsell suggestions are requested after product completion
The system SHALL provide a mobile upsell suggestion workflow that can be triggered when a customer marks a product-backed shopping-list item as done during a shopping flow.

#### Scenario: Product-backed item is completed
- **GIVEN** a local shopping-list item has a product id
- **WHEN** the customer marks the item done
- **THEN** the mobile app can request upsell suggestions for that checked product without blocking the item status update

#### Scenario: Free item is completed
- **GIVEN** a local shopping-list item has no product id
- **WHEN** the customer marks the item done, missing, or skipped
- **THEN** the mobile app does not request product upsell suggestions for that item

#### Scenario: Current route stop contains multiple products
- **GIVEN** an active shopping session marks a route stop containing multiple product-backed items as done
- **WHEN** the upsell workflow chooses a checked product for suggestions
- **THEN** the app requests at most one prompt opportunity for that stop completion

### Requirement: Suggestions use only existing catalog products
The backend SHALL return only products that exist in the catalog/search source and SHALL NOT return product names or product ids invented by AI or by the mobile client.

#### Scenario: Candidate exists in catalog
- **GIVEN** the backend has loaded candidate products from the configured product catalog
- **WHEN** a suggestion response is returned
- **THEN** every suggestion references one of those candidate product ids and includes product data from the catalog record

#### Scenario: AI returns unknown product id
- **GIVEN** an AI ranking response includes a product id that was not in the backend-provided candidate set
- **WHEN** the backend validates the AI response
- **THEN** the unknown product id is discarded before the mobile response is built

#### Scenario: Catalog product cannot be resolved
- **GIVEN** the checked product id or a candidate product id cannot be resolved from catalog data
- **WHEN** the backend builds a suggestion response
- **THEN** the backend omits unresolved products rather than fabricating product details

### Requirement: Suggestions respect shopping-list exclusion context
The backend SHALL exclude products already present on the current shopping list, already completed in the current shopping flow, or identical to the checked product.

#### Scenario: Candidate is already open on the list
- **GIVEN** the request includes a candidate product id in `currentListProductIds`
- **WHEN** the backend filters candidates
- **THEN** that product is excluded from suggestions

#### Scenario: Candidate is already completed
- **GIVEN** the request includes a candidate product id in `completedProductIds`
- **WHEN** the backend filters candidates
- **THEN** that product is excluded from suggestions

#### Scenario: Candidate equals checked product
- **GIVEN** a candidate has the same product id as `checkedProductId`
- **WHEN** the backend filters candidates
- **THEN** that candidate is excluded from suggestions

### Requirement: Store-aware candidate selection is preferred
The backend SHALL prefer candidates available in the current store when store context is present and SHALL mark whether each returned product has usable layout position data.

#### Scenario: Store context is provided
- **GIVEN** the request includes `storeId` or `storeCode`
- **WHEN** the backend retrieves candidate products
- **THEN** the backend scopes or ranks candidates toward matching store-specific product records where the product index supports that filter

#### Scenario: Product has layout code
- **GIVEN** a suggested catalog product has a non-empty layout code
- **WHEN** the backend returns the suggestion
- **THEN** the response marks `hasLayoutPosition` as true

#### Scenario: Product lacks layout code
- **GIVEN** a suggested catalog product has no usable layout code
- **WHEN** the backend returns the suggestion
- **THEN** the response may still include the product but marks `hasLayoutPosition` as false so routing can handle it as unresolved if added

### Requirement: OpenAI ranking is server-side and bounded
The backend SHALL call OpenAI only from the server, send only the checked product and a bounded candidate list, and require structured JSON output that selects from candidate product ids.

#### Scenario: OpenAI is enabled and candidates exist
- **GIVEN** an OpenAI API key is configured and a bounded candidate list exists
- **WHEN** the backend ranks upsell candidates
- **THEN** the OpenAI request contains only minimal product context and candidate product summaries needed for ranking

#### Scenario: Structured output is parsed
- **GIVEN** OpenAI returns a structured response matching the configured JSON schema
- **WHEN** the backend processes the response
- **THEN** suggestions are ordered by the validated AI ranking and include bounded reason text and confidence values

#### Scenario: OpenAI credentials are absent from mobile
- **GIVEN** the iOS app requests suggestions
- **WHEN** the request leaves the device
- **THEN** it does not include an OpenAI API key or direct OpenAI endpoint

### Requirement: Invalid or unavailable AI does not break shopping
The upsell workflow SHALL fall back to rule-ranked catalog suggestions or no suggestions when OpenAI is disabled, unavailable, rate-limited, times out, refuses, or returns invalid output.

#### Scenario: OpenAI times out
- **GIVEN** OpenAI does not respond within the configured timeout
- **WHEN** the backend handles the suggestion request
- **THEN** the backend returns fallback suggestions or an empty suggestions list without failing the shopping-list completion

#### Scenario: OpenAI returns invalid JSON
- **GIVEN** OpenAI returns output that cannot be parsed or validated against the schema
- **WHEN** the backend handles the response
- **THEN** the backend discards the AI output and uses fallback behavior

#### Scenario: No candidates remain
- **GIVEN** filtering removes all candidate products
- **WHEN** the backend builds the mobile response
- **THEN** it returns an empty suggestions list with a successful response status

### Requirement: Suggestion responses remain bound to the current completion context
The mobile app SHALL NOT display an upsell prompt returned for an older product/list context after the customer has completed or skipped a different product opportunity.

#### Scenario: Previous product response arrives late
- **GIVEN** a suggestion request for product A is still in flight
- **WHEN** the customer completes or skips product B and product A's response arrives afterward
- **THEN** the app discards product A's response instead of showing product A suggestions for product B's action

#### Scenario: Active list context changes while request is in flight
- **GIVEN** an upsell request was created for a specific shopping list
- **WHEN** the active shopping context moves to another list or session before the response arrives
- **THEN** the app ignores the stale response and keeps the shopping flow unchanged

### Requirement: Upcoming upsell opportunities can be preloaded
The mobile app SHALL preload upsell suggestions for upcoming product-backed shopping opportunities where enough list and store context is available, so a prompt can be displayed quickly when the customer later completes or skips that opportunity.

#### Scenario: Preloaded suggestion is available
- **GIVEN** suggestions for an upcoming product have already been loaded for the current list and store context
- **WHEN** the customer completes or skips that product opportunity
- **THEN** the app may show the preloaded prompt without waiting for a new network call

#### Scenario: Preload is unavailable
- **GIVEN** no fresh preloaded suggestions exist for the completed or skipped product
- **WHEN** the customer completes or skips that product opportunity
- **THEN** the app keeps the item/route action immediate and may request suggestions in the background

#### Scenario: Backend cache hit
- **GIVEN** the backend has a fresh suggestion cache entry for the same product/store/list exclusion context
- **WHEN** the mobile app requests suggestions
- **THEN** the backend returns the cached suggestions without calling OpenAI again

### Requirement: Shopping-session upsells are planned per station
The backend SHALL support a batch upsell plan for the current shopping list and store context, and the mobile app SHALL use that plan to display station-bound suggestions without making a new AI request when the station is checked off.

#### Scenario: Supermarket route plan is requested
- **GIVEN** the customer starts or opens a shopping session for a selected store
- **WHEN** the app has the current route stops and shopping list context
- **THEN** it sends one upsell plan request containing station opportunities, open product ids, completed product ids, and store context

#### Scenario: Multiple products share one station
- **GIVEN** apples and bananas are grouped into the same shopping stop
- **WHEN** the app builds the upsell plan request
- **THEN** it sends one station opportunity containing both trigger product ids and names rather than separate live requests per product

#### Scenario: Station is completed or skipped
- **GIVEN** a fresh preloaded plan response exists for `station:<shelf-id>`
- **WHEN** the customer completes or skips that station
- **THEN** the app looks up that station opportunity locally and may show the prepared suggestions without waiting for OpenAI or the backend

#### Scenario: Plan response arrives late
- **GIVEN** a plan request is still in flight
- **WHEN** the customer checks off a station before the plan is available
- **THEN** the station action remains immediate and no late response is shown for the already-handled station action

#### Scenario: Suggested product is added to the list
- **GIVEN** the customer adds a product from an upsell prompt
- **WHEN** that added product later appears in the shopping route
- **THEN** it is excluded as a trigger for new upsell opportunities

### Requirement: Suggestion prompts are throttled
The mobile app SHALL limit how often upsell prompts are displayed in a shopping session and SHALL reduce prompting after repeated dismissals.

#### Scenario: Cooldown is active
- **GIVEN** the last upsell prompt was shown less than the configured cooldown interval ago
- **WHEN** another product is completed
- **THEN** the app does not display another upsell prompt

#### Scenario: Session limit reached
- **GIVEN** the customer has already seen 10 upsell prompts in the current session
- **WHEN** another product is completed
- **THEN** the app suppresses additional upsell prompts for that session

#### Scenario: More than four opportunities exist
- **GIVEN** the current shopping session contains more than four eligible opportunities
- **WHEN** fewer than 10 upsell prompts have actually been shown
- **THEN** the app continues to allow prepared prompts for later completed opportunities

#### Scenario: Customer repeatedly dismisses
- **GIVEN** the customer dismisses upsell prompts repeatedly
- **WHEN** the app evaluates the next suggestion opportunity
- **THEN** the app reduces or suppresses further prompts according to the configured dismissal behavior

### Requirement: Customer can add or dismiss suggestions
The mobile app SHALL let the customer add a suggested product to the current shopping list or dismiss the prompt without changing the completed checked product.

#### Scenario: Customer adds suggestion
- **GIVEN** an upsell prompt shows a suggested product
- **WHEN** the customer selects add
- **THEN** the product is added through the existing shopping-list manager path and the active shopping session is refreshed if it targets the same list

#### Scenario: Customer dismisses prompt
- **GIVEN** an upsell prompt is visible
- **WHEN** the customer dismisses it
- **THEN** the checked item remains completed and no suggested product is added

#### Scenario: Suggested product already exists before add
- **GIVEN** the selected list already contains the suggested product as an open item by the time the customer taps add
- **WHEN** the app applies the add action
- **THEN** it uses existing duplicate handling instead of creating an uncontrolled duplicate row

### Requirement: Upsell telemetry avoids customer tracking
The backend SHALL record only minimal operational upsell events needed for debugging, rate limiting, dismissal handling, and future analytics, without requiring a persistent customer identity.

#### Scenario: Suggestion response is generated
- **GIVEN** the backend returns suggestions
- **WHEN** it records an event
- **THEN** the event stores product/session context and outcome metadata without storing personal customer data

#### Scenario: Customer dismisses suggestion
- **GIVEN** the mobile app reports a dismissal
- **WHEN** the backend stores dismissal data
- **THEN** the stored record is scoped to anonymous session/device context or product context rather than a named customer account
