## ADDED Requirements

### Requirement: Rebuilt staff workflows preserve capability parity
The rebuilt Admin Platform SHALL make existing authorized region, store, beacon, product, recipe, layout, audit, and diagnostics actions reachable through focused workflows before the corresponding old page is retired.

#### Scenario: A route is cut over
- **WHEN** a rebuilt admin route replaces its old page
- **THEN** a recorded parity check covers every existing authorized action on that route, direct navigation, and the relevant loading, empty, success, validation, conflict, and access-denied states

#### Scenario: Scoped user enters an admin-only route
- **WHEN** a region manager or store manager directly opens an admin-only product, recipe, index, or diagnostics workflow
- **THEN** the page exposes no protected data or mutation controls and the backend rejects unauthorized API calls

#### Scenario: Scoped user opens a foreign store detail or editor link
- **WHEN** a manager directly opens a store detail or store layout editor outside their assigned scope
- **THEN** the backend rejects the data requests and the page presents an access-denied state without exposing the foreign store or layout

### Requirement: Staff can finish workflows in context
The rebuilt Admin Platform SHALL return users to a relevant list or detail context after a successful create, assignment, release, publish, archive, or delete action and SHALL show the confirmed resulting state.

#### Scenario: Beacon is assigned from a store
- **WHEN** staff assigns an eligible beacon from an in-scope store detail page and the backend confirms the assignment
- **THEN** the store detail shows the active assignment and offers the next available store action

#### Scenario: Beacon target is beyond the first store page
- **GIVEN** an authorized user can access more than 100 active stores
- **WHEN** they select a beacon assignment target beyond the first page
- **THEN** the target remains reachable and the confirmed assignment identifies the correct store

#### Scenario: Recipe edit fails
- **WHEN** a recipe edit fails after the user changes metadata, tags, ingredients, or steps
- **THEN** the UI does not claim success, identifies the failed stage, reloads authoritative detail where needed, and preserves the user's unsaved input for correction
