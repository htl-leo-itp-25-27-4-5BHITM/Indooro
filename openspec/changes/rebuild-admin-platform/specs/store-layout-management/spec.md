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

### Requirement: Layout validation identifies actionable map problems
Validation SHALL distinguish blocking errors from warnings and SHALL identify the affected element or map context for out-of-bounds geometry, missing entrance, duplicate or unassigned beacons, invalid shelf metadata, and unreachable product targets where routing data is available.

#### Scenario: Invalid beacon placement is found
- **WHEN** a store layout contains an unassigned or duplicate beacon
- **THEN** validation identifies each affected element, prevents publish while the blocking problem remains, and allows the user to select it in the editor
