## ADDED Requirements

### Requirement: Direct navigation after create
The admin web SHALL navigate to the most useful target after a successful create and SHALL NOT show an intermediate confirmation page.

#### Scenario: Store anlegen
- **WHEN** an admin submits the "Store anlegen" form successfully
- **THEN** the browser shows the detail page of the new store with its setup checklist
- **AND** a success notice is shown on that page

### Requirement: Tables fit or scroll inside their container
Every admin table SHALL fit the content column or scroll horizontally only inside its own container with a visible scroll affordance; no table SHALL be cut off and the page SHALL NOT scroll horizontally at 1280 px and 1440 px viewport width.

#### Scenario: Beacons table at 1280 px
- **WHEN** an admin opens the beacons page at 1280x800
- **THEN** all columns are readable or reachable inside the table container
- **AND** the document has no horizontal scroll

### Requirement: Layout editor fits the viewport
The layout editor SHALL fill the viewport below the app header; canvas and side panels SHALL scroll internally and the document SHALL NOT scroll.

#### Scenario: Editor at 1440x900
- **WHEN** an admin opens the layout editor at 1440x900 or 1280x800
- **THEN** `document.scrollingElement.scrollHeight` equals the viewport height
- **AND** all editor tools are visible without page scrolling

### Requirement: Consistent page states and copy
Every admin data page SHALL show a loading state, an empty state and an error state with a retry action, SHALL use German UI copy and SHALL use consistent button labels and order.

#### Scenario: Empty list
- **WHEN** a list page loads with zero items
- **THEN** the page shows a German empty-state text and the primary create action
