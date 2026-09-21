## ADDED Requirements

### Requirement: Shopping completion can trigger non-blocking upsell prompts
The mobile app SHALL allow product completion in shopping-list and active-session flows to trigger a non-blocking upsell prompt opportunity without changing the existing completion semantics.

#### Scenario: Open item is checked off from the list
- **GIVEN** a product-backed open shopping item is visible in the shopping-list screen
- **WHEN** the customer marks it done
- **THEN** the item is immediately counted as completed and the app can request an upsell prompt opportunity afterward

#### Scenario: Current route stop is completed
- **GIVEN** an active shopping session has a current route stop
- **WHEN** the customer marks the current stop done
- **THEN** the route advances as before and the app can evaluate one upsell prompt opportunity for the completed stop

#### Scenario: Current route stop is skipped
- **GIVEN** an active shopping session has a current route stop with product-backed items
- **WHEN** the customer skips the current stop
- **THEN** the route advances as before and the app can evaluate one upsell prompt opportunity for the skipped stop without blocking navigation

#### Scenario: Upsell request fails
- **GIVEN** an upsell request fails, times out, or returns no suggestions
- **WHEN** the customer has marked an item done
- **THEN** the item remains done and the shopping session remains usable

### Requirement: Accepted upsell products reuse local list behavior
The mobile app SHALL add accepted upsell suggestions through the existing local product-add logic so duplicate handling, quantity behavior, persistence, and route refresh remain consistent.

#### Scenario: Suggested product is accepted
- **GIVEN** an upsell suggestion contains a product id, name, price, and layout code where available
- **WHEN** the customer adds the suggestion
- **THEN** the app creates or updates a normal local shopping-list item using the existing product add behavior

#### Scenario: Active session targets the selected list
- **GIVEN** the accepted suggestion is added to the list used by the active shopping session
- **WHEN** the item is persisted locally
- **THEN** the session snapshot is refreshed so the new product can appear in remaining stops or unresolved items

#### Scenario: Suggested product lacks routable layout
- **GIVEN** the accepted suggestion has no usable layout code or shelf match
- **WHEN** the shopping route snapshot is rebuilt
- **THEN** the added item appears as unresolved instead of breaking route calculation
