# store-layout-management Specification

## Purpose
Defines store-specific layout versioning, admin layout editing, active/current layout publication, mobile layout access, product-to-layout mapping, routing constraints, and MVP layout assumptions.
## Requirements
### Requirement: Store layouts are versioned per store
The system SHALL manage store layouts as store-specific versions and SHALL identify which version is active/current for client use.

#### Scenario: New layout version is created
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** an authorized admin saves a new layout version for a store
- **THEN** the version belongs to that store and can be distinguished from prior versions

#### Scenario: Current layout is requested
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a client requests the current layout for a store
- **THEN** the system returns the active version for that store if one exists

### Requirement: Admin layout editor manages physical map objects
The Admin Platform SHALL support layout data that can represent physical map objects such as walls, shelves, aisles, cashiers, entrances, and points of interest.

#### Scenario: Store employee edits shelf layout
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** an authorized user edits shelf or aisle objects in the admin layout workflow
- **THEN** the saved layout data can represent those objects for later mobile display and routing

#### Scenario: Layout contains entrance and cashier
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a layout contains entrance or cashier objects
- **THEN** the layout data preserves them as meaningful map objects rather than anonymous decorative elements

### Requirement: Layout editor workflows are no-code oriented
The system SHALL treat layout editing as an admin/staff workflow that should be usable without code changes and can support draw, move, resize, rotate, snap, group, delete, and layer concepts as future editor capabilities.

#### Scenario: Future snapping behavior is added
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a future change adds snap-to-grid or object snapping
- **THEN** it must preserve the saved layout data contract and document the interaction in OpenSpec

#### Scenario: Future layer behavior is added
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a future change adds layout layers
- **THEN** the change must define how layer visibility and persistence work before implementation

### Requirement: Mobile current-layout route is public
The system SHALL expose the current layout needed by the mobile customer experience through a public mobile route unless a future OpenSpec change explicitly changes that route boundary. When no active store layout exists, the route SHALL return a distinguishable fallback/default layout response rather than presenting it as a persisted active layout.

#### Scenario: Anonymous mobile client opens map
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** an anonymous mobile client requests `/api/mobile/stores/{storeId}/layout/current`
- **THEN** the backend returns the active layout for that store without requiring admin login

#### Scenario: Store has no active layout
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a mobile client requests the current layout for a store without an active layout
- **THEN** the system returns an explicit fallback/default layout response with no persisted layout id so the client does not mistake it for an active saved layout

#### Scenario: Client displays fallback layout
- **GIVEN** a mobile layout response has no persisted layout id or is otherwise marked as fallback/default
- **WHEN** the mobile client renders the map
- **THEN** the client can show fallback/debug context while still keeping map display usable

### Requirement: Admin layout routes are protected
The system SHALL protect admin layout routes under `/api/stores/{storeId}/layout/*` and SHALL apply role/scope checks before reading or mutating layout versions.

#### Scenario: Admin edits any store layout
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** an authenticated `admin` edits a layout for any store
- **THEN** the system allows the operation if existing layout validation passes

#### Scenario: Store manager edits another store layout
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a `store-manager` tries to edit a layout outside the assigned store
- **THEN** the system rejects the operation

### Requirement: Product locations map to layout targets
The system SHALL enable products with valid layout codes to map to layout targets such as shelf areas or nearby walkable target points.

#### Scenario: Product has valid layout code
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a product with a valid layout code is selected
- **THEN** the mobile experience can identify the corresponding layout target when the layout contains matching location data

#### Scenario: Layout target is blocked
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a product location maps to a shelf or blocked object
- **THEN** routing should target a nearby walkable point rather than routing through the blocked object

### Requirement: Routing uses walkable areas
The mobile routing model SHALL route through walkable areas such as aisles and SHALL avoid walls, shelves, and other blocked layout objects.

#### Scenario: Route is calculated to product target
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a mobile client calculates a route to a product target
- **THEN** the route follows walkable layout space and avoids blocked objects

#### Scenario: No walkable path exists
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** no valid walkable path exists between start and target
- **THEN** the client or backend route workflow must show an explicit no-route state rather than drawing an invalid path

### Requirement: MVP layout assumptions are explicit
The system SHALL treat one-floor layouts, approximate grid/vector representation, and one-product route targets as MVP assumptions unless expanded by a future OpenSpec change.

#### Scenario: Multi-floor support is requested
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a future change requests multi-floor navigation
- **THEN** the proposal must define floor transitions, layout data shape, and route behavior

#### Scenario: Shopping-list optimization is requested
- **GIVEN** store layout data and route-capable map context are available
- **WHEN** a future change requests optimized routes across multiple products
- **THEN** the proposal must define ordering, route recalculation, and UI behavior before implementation

### Requirement: Layout grid and scale are explicit
The system SHALL treat the store map as a grid/vector layout with real-world scale metadata sufficient for positioning and route calculation.

#### Scenario: Layout is loaded by mobile app
- **GIVEN** a layout JSON contains `gridSize` and positioned elements
- **WHEN** the mobile app loads the layout
- **THEN** it can derive map bounds and route graph coordinates from that layout

#### Scenario: Physical scale is needed
- **GIVEN** route distance, beacon accuracy, or AR alignment depends on map units
- **WHEN** a future change changes grid scale
- **THEN** it must document the relationship between map units and real metres

### Requirement: Layout objects include routable access semantics
The layout model SHALL allow blocked physical objects such as shelves and walls to remain separate from walkable aisles and access points used for navigation.

#### Scenario: Product maps to shelf slot
- **GIVEN** a product layout code resolves to a shelf, segment, compartment, or slot
- **WHEN** the route target is calculated
- **THEN** the route target is placed at a nearby walkable access point rather than inside the blocked shelf geometry

#### Scenario: Shelf has access angle metadata
- **GIVEN** a layout element includes `accessAngle` or equivalent access metadata
- **WHEN** navigation target placement uses that element
- **THEN** the app can choose the aisle-facing approach side more accurately

### Requirement: Layout JSON preserves editor fields
The layout JSON contract SHALL preserve fields needed by the admin editor and mobile app, including `shopName`, `gridSize`, `elements`, element `type`, coordinates, dimensions, label/category/meter, rotation, access angle, lock state, and beacon identifiers where present.

#### Scenario: Editor saves layout
- **GIVEN** an authorized user saves a layout from the admin editor
- **WHEN** the layout JSON is persisted
- **THEN** editor/mobile fields needed for display, routing, and beacon placement are preserved

#### Scenario: Mobile app decodes layout
- **GIVEN** the mobile app receives layout JSON
- **WHEN** optional editor fields are absent
- **THEN** the app treats absent optional fields as unavailable rather than failing the whole layout unless required fields are missing

### Requirement: Map display supports zoom and rotation
The customer-facing map experience SHALL support zoomable map inspection and SHALL preserve layout rotation metadata so rotated shelves or elements display consistently.

#### Scenario: Customer inspects map
- **GIVEN** a store layout is visible
- **WHEN** the customer zooms or pans the map
- **THEN** the map remains usable for finding product and route context

#### Scenario: Shelf is rotated
- **GIVEN** a layout element contains `rotation`
- **WHEN** the admin editor saves and the customer/mobile map renders that layout
- **THEN** the rotated element is preserved instead of being flattened to an unrotated block

### Requirement: Admin editor can place beacons in store context
The admin layout editor SHALL support placing beacon elements from the beacons assigned to the selected store so mobile positioning can use the active layout as calibration input.

#### Scenario: Store editor context loads
- **GIVEN** a store has assigned active beacons
- **WHEN** an authorized user opens `/admin/editor/?storeId=<storeId>`
- **THEN** the editor can show those assigned beacons for placement in the layout

#### Scenario: No free beacon remains
- **GIVEN** all assigned beacons are already used or no eligible beacon is available
- **WHEN** the user tries to add another beacon element
- **THEN** the editor shows an explicit unavailable/empty state

### Requirement: Layout editor keeps legacy and store modes distinct
The layout editor SHALL keep legacy global layout mode and store-specific layout mode distinct until a future change removes the legacy compatibility layer.

#### Scenario: Editor opens without store id
- **GIVEN** the editor is opened without `storeId`
- **WHEN** it loads and saves layout data
- **THEN** it uses the legacy/global layout flow

#### Scenario: Editor opens with store id
- **GIVEN** the editor is opened with `storeId`
- **WHEN** it loads and saves layout data
- **THEN** it uses store-specific layout versions for that store

### Requirement: Test-room layout artifacts are supporting inputs
The PDF test-room layout artifact SHALL be treated as supporting calibration/test context and SHALL NOT replace the JSON layout contract.

#### Scenario: Test room PDF is reviewed
- **GIVEN** `documentation/Layoutplan-Testraum.pdf` contains a simple shelf/beacon sketch with approximate dimensions
- **WHEN** a future change uses it for tests
- **THEN** the change must translate needed geometry into explicit layout JSON or test data

### Requirement: Layout editor is a dedicated planning tool
The redesigned layout editor SHALL present a dedicated editor workspace with a tool toolbar, canvas, inspector panel, layer or element list, status bar, save/publish controls, validation panel, and store context where applicable.

#### Scenario: Staff opens store editor
- **WHEN** an authorized user opens `/admin/editor/?storeId=<storeId>`
- **THEN** the editor shows the selected store context, assigned beacons, current layout version information, editor tools, canvas, inspector, element list, and save/publish status

#### Scenario: Staff opens legacy editor
- **WHEN** an authorized user opens `/admin/editor/` without a `storeId`
- **THEN** the editor clearly indicates legacy/global mode and preserves the legacy layout API behavior until a future change removes that compatibility mode

### Requirement: Editor tools use explicit modes
The layout editor SHALL expose explicit interaction modes for selecting, moving, drawing or adding, editing, and deleting layout elements, and SHALL make the active mode visually and programmatically clear.

#### Scenario: User switches tool mode
- **WHEN** the user switches between select, move, draw/add, edit, and delete modes
- **THEN** the active mode, allowed canvas interactions, cursor behavior, and keyboard shortcuts update consistently

#### Scenario: User deletes an element
- **WHEN** the user deletes a selected layout element
- **THEN** the editor asks for confirmation when the deletion affects routable, beacon, product-position, entrance, cashier, or other critical map semantics

### Requirement: Editor canvas supports professional map manipulation
The layout editor SHALL support zoom, pan, grid visibility, grid size, snap-to-grid, element snapping where practical, keyboard movement, and stable map bounds without changing the persisted layout JSON contract.

#### Scenario: User adjusts view
- **WHEN** the user zooms, pans, or toggles the grid
- **THEN** the canvas remains correctly framed, elements remain selectable, and map coordinates continue to correspond to the saved grid/vector layout

#### Scenario: User moves an element
- **WHEN** the user moves an element with snapping enabled
- **THEN** the element position snaps to the configured grid or valid snap target and remains within the map bounds

### Requirement: Editor inspector edits selected element details
The layout editor SHALL provide an inspector for the selected element that exposes relevant fields such as type, label, category, layout code or product-position metadata, coordinates, dimensions, rotation, access angle, lock state, beacon identity, and validation status.

#### Scenario: Shelf is selected
- **WHEN** the user selects a shelf, aisle, wall, entrance, cashier, or point-of-interest element
- **THEN** the inspector shows editable fields appropriate to that element type and prevents invalid values from being saved silently

#### Scenario: Beacon is selected
- **WHEN** the user selects a beacon element in store-specific mode
- **THEN** the inspector lets the user choose from beacons assigned to the store and prevents duplicate placement of the same active beacon

### Requirement: Editor provides layout validation and readiness feedback
The layout editor SHALL validate layout readiness before save/publish, including required map metadata, out-of-bounds elements, overlapping blocked elements, missing entrances where required by current routing assumptions, unassigned beacons, duplicate beacons, invalid product-position metadata, and elements that cannot support routing.

#### Scenario: User validates layout
- **WHEN** the user opens validation or attempts to publish a layout
- **THEN** the editor lists blocking errors and non-blocking warnings with direct links or selection affordances for affected elements

#### Scenario: Layout has warnings only
- **WHEN** a layout has warnings but no blocking errors
- **THEN** the editor allows save and requires an explicit publish confirmation that explains the remaining warnings

### Requirement: Editor supports version save, publish, and preview
The layout editor SHALL preserve store-specific versioning while distinguishing draft save, publish/activate, import/export, and preview actions.

#### Scenario: User saves a draft
- **WHEN** the user saves a layout draft for a store
- **THEN** a store-specific layout version is created or updated according to the implementation approach without replacing the active mobile layout unless the user publishes it

#### Scenario: User publishes a layout
- **WHEN** the user publishes or activates a store layout
- **THEN** the backend keeps one active layout version for the store and prior active versions remain inspectable according to the existing versioning model

#### Scenario: User previews mobile layout
- **WHEN** the user opens mobile preview from the editor
- **THEN** the preview renders the active or draft layout in a mobile-sized view and indicates unresolved beacons, product positions, and routing readiness

### Requirement: Editor preserves layout compatibility
The redesigned layout editor SHALL preserve the current layout JSON fields and public/mobile layout behavior unless a future OpenSpec change explicitly modifies the layout contract.

#### Scenario: Redesigned editor saves layout
- **WHEN** the redesigned editor persists layout JSON
- **THEN** fields such as `shopName`, `gridSize`, `elements`, element `type`, coordinates, dimensions, label/category/meter, rotation, access angle, lock state, and beacon identifiers remain available for existing admin and mobile consumers

#### Scenario: Mobile app loads current layout
- **WHEN** the mobile app requests the current layout after an admin redesign implementation
- **THEN** the mobile layout response remains compatible with the existing iOS/customer rendering and routing assumptions

