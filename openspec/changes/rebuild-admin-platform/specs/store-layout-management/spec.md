## ADDED Requirements

### Requirement: Editor commands preserve recoverable layout state
The layout editor SHALL record create, move, resize, rotate, delete, beacon selection, and inspector edits as reversible commands within an editing session. Saving, publishing, or reloading SHALL expose whether unsaved changes remain.

#### Scenario: User reverses a move
- **WHEN** a user moves a shelf and invokes undo followed by redo
- **THEN** its coordinates return to the prior values and then to the moved values without changing unrelated elements or the persisted active layout

#### Scenario: User leaves with unsaved changes
- **WHEN** a user navigates away from a modified draft
- **THEN** the editor warns that the current session contains unsaved changes and allows the user to stay

### Requirement: Layout publication is separate from draft work
The editor and backend SHALL distinguish saved draft versions from the active mobile version. Publishing SHALL require a validation result and confirmation. Mobile current-layout reads SHALL return only the active version or the documented fallback.

#### Scenario: Draft is saved when an active layout exists
- **GIVEN** a store has an active layout version
- **WHEN** staff saves a draft for that store
- **THEN** the draft is retrievable in the admin version list and the mobile current-layout response remains the previous active version

#### Scenario: First layout is saved as draft
- **GIVEN** a store has no active layout version
- **WHEN** staff saves its first layout as draft
- **THEN** the draft is retrievable by authorized staff and anonymous mobile current-layout reads continue to use the documented no-active-layout behavior

#### Scenario: Draft is published
- **WHEN** authorized staff publish a draft with no blocking validation errors and confirm the action
- **THEN** exactly that version becomes active, the former active version is retained in history, and mobile current-layout reads return the published content

#### Scenario: Historical store version is restored without altering its content
- **GIVEN** a store has an archived layout version and a different active version
- **WHEN** authorized staff open the archived version and confirm its reactivation without making an edit
- **THEN** exactly that archived version becomes active, the former active version remains in history, and mobile current-layout reads return the restored content

#### Scenario: Historical global layout is republished unchanged
- **GIVEN** an admin opens a prior global layout version
- **WHEN** the admin confirms publication without making an edit
- **THEN** a new global version containing that layout becomes current and is visible to mobile readers

#### Scenario: Global layout history exceeds a single search page
- **GIVEN** more global layout versions exist than one OpenSearch result page
- **WHEN** an admin publishes another global layout and opens recent history
- **THEN** the newly published version appears in newest-first order within the requested limit

#### Scenario: Admin loads older global layout versions
- **GIVEN** global layout history contains more than twelve versions
- **WHEN** an admin requests additional versions from the history panel
- **THEN** older versions become selectable while the newest versions remain visible

#### Scenario: History loading is retried during an edit
- **GIVEN** the store or global editor has unsaved changes and its version-history request fails
- **WHEN** the user retries the history request
- **THEN** the version list loads without replacing or saving the unsaved layout

### Requirement: Layout validation identifies actionable map problems
Validation SHALL distinguish blocking errors from warnings and SHALL identify the affected element or map context for out-of-bounds geometry, missing entrance, duplicate or unassigned beacons, invalid shelf metadata, and unreachable product targets where routing data is available.

#### Scenario: Invalid beacon placement is found
- **WHEN** a store layout contains an unassigned or duplicate beacon
- **THEN** validation identifies each affected element, prevents publish while the blocking problem remains, and allows the user to select it in the editor

#### Scenario: Direct store publication with an unassigned beacon is rejected
- **GIVEN** a store has no active assignment for a beacon placed in a saved layout
- **WHEN** an API client attempts immediate publication or activation of that layout
- **THEN** the backend rejects the publication and leaves the prior active layout unchanged

#### Scenario: Historical element IDs are repaired before publication
- **GIVEN** a saved draft contains string or missing element IDs
- **WHEN** staff opens it in the editor and repairs its IDs
- **THEN** every element receives a unique positive JSON integer that the iOS client can decode, the change is undoable, and the draft can be saved

#### Scenario: Published layouts require mobile-compatible IDs
- **WHEN** an API client publishes a global layout or activates a store layout containing a string, missing, or unsafe element ID
- **THEN** publication is rejected before replacing the active layout, while the same historical content remains saveable as a draft

#### Scenario: Shelf addresses stay unique for product routing
- **GIVEN** two shelves share a category and section or a shelf has only a bare category code
- **WHEN** staff assigns shelf sections
- **THEN** the editor preserves valid unique sections, assigns the remaining sections by map position, and records one undoable change

#### Scenario: Shelf category is chosen from the catalog
- **WHEN** staff selects an existing catalog category for a shelf
- **THEN** the editor assigns the first free section for that category, allows undo, and keeps manual code entry available if the catalog request fails

#### Scenario: Product positions lack a navigable shelf address
- **WHEN** a shelf has product positions or a layout code without a valid category and section
- **THEN** validation blocks publication and explains that customer and mobile routes require the shelf address
