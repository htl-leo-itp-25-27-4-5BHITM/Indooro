## ADDED Requirements

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
