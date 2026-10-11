## MODIFIED Requirements

### Requirement: Admin dashboard is a build-free static module application
The Admin Platform SHALL remain available from Quarkus-protected `/admin/*` pages during migration. The replacement SHALL use typed, page-specific modules built into static assets that Quarkus serves without a frontend runtime server in production. A route SHALL switch from the existing static ES-module application to the replacement only after its behavior, direct-link, role, scope, and accessibility checks pass. Until then, existing page entries and their DOM-free `core.js` and `editor-core.js` tests SHALL remain usable.

#### Scenario: A page entry is opened
- **WHEN** an authenticated staff user directly opens an existing or migrated `/admin/*` page
- **THEN** Quarkus serves the selected frontend for that route, the page loads only its required workflow, and the session and backend scope rules remain effective

#### Scenario: Pure logic is changed
- **WHEN** a developer changes validation, formatting, routing, or editor command logic in either frontend during migration
- **THEN** the relevant logic has an automated unit test runnable without a live browser or backend

#### Scenario: Migration parity fails
- **WHEN** a candidate replacement route fails its agreed workflow, direct-link, role, scope, or accessibility check
- **THEN** that route remains on the existing frontend and the failed check is recorded as an open rebuild task

## ADDED Requirements

### Requirement: Admin workflows are isolated by route
The replacement Admin Platform SHALL load page-specific data and controls and SHALL not initialize unrelated management workflows when a direct link is opened.

#### Scenario: Store manager opens store detail
- **WHEN** a store manager opens `/admin/stores/detail/?storeId=<assigned-id>` directly
- **THEN** the store detail and shared shell initialize without fetching product, recipe, or diagnostics management data

### Requirement: Admin mutations preserve visible form state on failure
The Admin Platform SHALL prevent duplicate submission, show validation and server errors within the active workflow, and SHALL close or clear the workflow only after a successful mutation response.

#### Scenario: Store save fails validation
- **WHEN** a store form submission receives a validation error
- **THEN** the form retains the entered values, shows the error near the affected fields, and allows a corrected retry
