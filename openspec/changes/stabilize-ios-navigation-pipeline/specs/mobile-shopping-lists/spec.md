## MODIFIED Requirements

### Requirement: Shopping route order supports list order and optimized mode
The mobile app SHALL support route stop ordering by list order and by an optimized mode. In optimized mode the app SHALL compute a distance matrix between the planning start point and all stops from the shared walkable graph, SHALL build a nearest-neighbor order (ties broken by lower order seed, then title), and SHALL improve it with 2-opt on the open path until no move gains more than the 2-opt minimum gain or the pass limit is reached. The planning start point SHALL be the projected position at planning time, otherwise the entrance element, otherwise list order SHALL be used. Ordering SHALL run only on planning events and never on position updates.

#### Scenario: List-order mode is selected
- **GIVEN** a shopping list has multiple resolved stops
- **WHEN** route mode is list order
- **THEN** stops are ordered by the item/list order seed

#### Scenario: Optimized mode is selected
- **GIVEN** a projected position and a routable layout graph are available
- **WHEN** a tour starts in optimized mode
- **THEN** the stops are ordered by nearest neighbor improved with 2-opt over graph distances from the projected position

#### Scenario: 2-opt removes a crossing
- **GIVEN** a nearest-neighbor order whose path crosses itself
- **WHEN** 2-opt runs
- **THEN** the returned order has a shorter total graph distance than the nearest-neighbor order

### Requirement: Shopping tour lifecycle is explicit
The iOS app SHALL start a tour only for a list with at least one open item („Tour starten“), SHALL offer „Tour fortsetzen“ and „Beenden“ WHILE the list is the active tour list, SHALL stop the tour before deleting its list, and WHEN the tour stops SHALL clear the plan, the active stop, the snapshot, and the route target, persist the state, and clear any visible upsell prompt. WHILE a tour is active, the app SHALL rebuild the plan only on tour start, list change, route mode toggle, „Neu planen“, and layout change, SHALL build the snapshot from the stored plan, and SHALL set the route target to the active stop or clear it WHEN no stop remains. Position changes SHALL NOT trigger a synchronization.

#### Scenario: Tour list becomes empty
- **GIVEN** a tour is active
- **WHEN** the last open item is marked done
- **THEN** the route target is cleared and the tour panel shows „Alle Stopps erledigt!“

#### Scenario: Tour list is deleted
- **GIVEN** the active tour list is deleted from the menu
- **WHEN** the deletion completes
- **THEN** the tour was stopped first and no route target remains

#### Scenario: Customer walks during a tour
- **GIVEN** a tour is active
- **WHEN** the projected position changes 100 times without any planning event
- **THEN** the plan is never rebuilt and the snapshot's stop order is unchanged

### Requirement: Stop completion marks all items of the current stop
WHEN the customer marks the active stop done or skipped, the iOS app SHALL set every item of the active stop to `done` or `skipped` respectively, SHALL make the next stop of the stored plan the active stop without re-optimizing the remaining order, and SHALL set the route target to it.

#### Scenario: Skip a stop
- **GIVEN** the active stop has items X and Y and the stored plan continues with stop C
- **WHEN** the customer taps „Überspringen“
- **THEN** X and Y have status `skipped`, count as completed for progress, and C becomes the active stop even if another stop is now closer

## ADDED Requirements

### Requirement: Active stop is stable between explicit events
The iOS app SHALL store the active stop of a tour by stop identifier. The active stop SHALL change only WHEN it is completed or skipped, WHEN its items are removed from the list, WHEN the customer toggles route mode or requests „Neu planen“, WHEN the layout changes so that the stop no longer resolves, or WHEN the tour stops.

#### Scenario: Two stops are almost equally far
- **GIVEN** active stop A and stop B differ by 0.3 m in route distance from the customer
- **WHEN** position noise makes B slightly closer for several updates
- **THEN** A stays the active stop and the route to A is kept

#### Scenario: Explicit re-planning
- **GIVEN** a tour with active stop A
- **WHEN** the customer taps „Neu planen“ while standing next to stop B
- **THEN** the remaining stops are re-planned from the projected position and B may become the active stop

### Requirement: List changes re-plan only the remaining stops
WHEN items of the active tour list are added, removed, or changed, the iOS app SHALL keep the active stop IF it still has open items, SHALL re-plan only the other remaining stops starting at the active stop's map point, and SHALL rebuild the route only IF the active stop changed or its map point moved.

#### Scenario: Product added during a tour
- **GIVEN** a tour with active stop A and remaining stops C and D
- **WHEN** a product resolving to new stop E is added
- **THEN** A stays active, the order of C, D, and E is re-planned from A, and the route to A is unchanged

#### Scenario: Active stop items removed
- **GIVEN** a tour with active stop A and remaining stops C and D
- **WHEN** all open items of A are removed from the list
- **THEN** the remaining stops are re-planned from the projected position and the first of them becomes the active stop
