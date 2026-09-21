## ADDED Requirements

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
