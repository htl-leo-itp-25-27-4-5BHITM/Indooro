## ADDED Requirements

### Requirement: Admin Platform uses real protected subpages
The Admin Platform SHALL expose focused, protected staff pages under `/admin/` instead of relying on hash anchors as the primary navigation model.

#### Scenario: Staff opens dashboard
- **WHEN** an authenticated staff user opens `/admin/`
- **THEN** the system serves the Admin Platform dashboard page with navigation to allowed management pages

#### Scenario: Staff opens management page directly
- **WHEN** an authenticated staff user opens `/admin/regions/`, `/admin/stores/`, `/admin/stores/detail/`, `/admin/beacons/`, `/admin/products/`, or `/admin/recipes/`
- **THEN** the system serves the requested protected Admin Platform subpage and loads only the workflow data needed by that page

#### Scenario: Anonymous user opens management page
- **WHEN** an anonymous user opens any protected Admin Platform subpage under `/admin/`
- **THEN** the system starts the configured Keycloak login flow instead of rendering protected admin data

### Requirement: Admin navigation is role-aware across pages
The Admin Platform SHALL render navigation and workflow entry points according to the authenticated user's role and Indooro scope on every Admin Platform page.

#### Scenario: Admin opens navigation
- **WHEN** an authenticated `admin` opens an Admin Platform page
- **THEN** navigation includes dashboard, regions, stores, beacons, products, recipes, server logs, and layout editor entry points

#### Scenario: Non-admin opens navigation
- **WHEN** an authenticated `region-manager` or `store-manager` opens an Admin Platform page
- **THEN** product, recipe, system-log, and server-log navigation entries are not visible

#### Scenario: Non-admin opens admin-only URL
- **WHEN** an authenticated `region-manager` or `store-manager` opens `/admin/products/`, `/admin/recipes/`, or `/admin/server-logs/`
- **THEN** the UI does not expose the admin-only management workflow or protected diagnostic data

### Requirement: Store detail is deep-linkable
The Admin Platform SHALL support direct store detail URLs through `/admin/stores/detail/?storeId=<id>` while preserving existing scoped store-detail data rules.

#### Scenario: Store detail opens with store id
- **WHEN** an authenticated user opens `/admin/stores/detail/?storeId=<id>` for a store inside their allowed scope
- **THEN** the UI loads store metadata, assigned beacons, layout versions, and audit history for that store

#### Scenario: Store detail opens without store id
- **WHEN** an authenticated user opens `/admin/stores/detail/` without a `storeId`
- **THEN** the UI shows an explicit empty or selection state instead of failing or redirecting away

#### Scenario: Store detail opens outside scope
- **WHEN** a scoped authenticated user opens `/admin/stores/detail/?storeId=<id>` for a store outside their allowed scope
- **THEN** the UI shows an access denied state and does not render stale protected detail data

### Requirement: German Admin UI copy uses native characters
Visible German Admin Platform UI text SHALL use native German characters such as `ä`, `ö`, `ü`, `Ä`, `Ö`, `Ü`, and `ß` instead of ASCII transliterations where German text is intended.

#### Scenario: German labels are rendered
- **WHEN** Admin Platform pages, the layout editor, or server-log pages render German labels, buttons, empty states, confirmations, and status messages
- **THEN** the visible text uses native German spelling such as `Übersicht`, `prüfen`, `Zurücksetzen`, `Straße`, and `Änderungen`

### Requirement: Admin pages provide explicit page states
Each Admin Platform subpage SHALL provide clear loading, empty, success, error, and access-denied states that are scoped to the current page workflow.

#### Scenario: Page is loading data
- **WHEN** an Admin Platform subpage starts loading protected data
- **THEN** the page shows an explicit loading state for that workflow

#### Scenario: Page has no data
- **WHEN** a list or detail workflow has no records for the current role, scope, or filter
- **THEN** the page shows an explicit empty state with the relevant next action when that action is allowed

#### Scenario: Page receives authorization failure
- **WHEN** a protected request on an Admin Platform subpage returns `401` or `403`
- **THEN** the page redirects to login or shows an access-denied state without rendering stale protected data

### Requirement: Admin editor is visually distinct and workflow-focused
The layout editor SHALL remain a protected Admin Platform workflow while using a visually distinct editor interface that does not resemble the previous dashboard layout.

#### Scenario: User opens layout editor
- **WHEN** an authenticated user opens `/admin/editor/` with or without a `storeId`
- **THEN** the editor shows a focused layout-editing workspace with improved controls, native German copy, and preserved legacy/global versus store-specific behavior

#### Scenario: User returns from store editor
- **WHEN** a user opens the editor with `storeId=<id>` and follows the back link
- **THEN** the user is returned to `/admin/stores/detail/?storeId=<id>`
