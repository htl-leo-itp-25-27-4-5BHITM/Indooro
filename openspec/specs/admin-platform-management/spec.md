# admin-platform-management Specification

## Purpose
Defines the protected Admin Platform management surface for staff workflows such as regions, stores, beacons, layout administration, audit logs, error logs, role-aware UI state, and archive-based lifecycle behavior.
## Requirements
### Requirement: Admin Platform is the staff management surface
The system SHALL provide an Admin Platform under `/admin` for authorized staff to manage Indooro regions, stores, beacons, layouts, audit logs, and error logs.

#### Scenario: Authorized admin opens platform
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** a Keycloak-authenticated user with an active allowed Indooro assignment opens `/admin/`
- **THEN** the system serves the static Admin Platform and allows the frontend to load protected admin data according to role and scope

#### Scenario: Anonymous user opens platform
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** an anonymous user opens `/admin/`
- **THEN** the system starts the configured Keycloak login flow instead of rendering protected admin data

### Requirement: Region management is protected
The system SHALL protect region management APIs and SHALL apply role and scope rules before returning or mutating region data.

#### Scenario: Admin lists regions
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** an authenticated `admin` requests region data
- **THEN** the system returns the available regions according to existing filters

#### Scenario: Store manager requests unrelated regions
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** an authenticated `store-manager` requests broad region management data
- **THEN** the system restricts or rejects the response according to the user's assigned store scope

### Requirement: Store management is protected and scoped
The system SHALL protect store management APIs and SHALL return or mutate only stores allowed by the current user's role and Indooro assignment.

#### Scenario: Region manager creates a store in assigned region
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** a `region-manager` creates a store for the assigned region
- **THEN** the system accepts the mutation if all existing validation rules pass

#### Scenario: Region manager creates a store outside assigned region
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** a `region-manager` creates or updates a store outside the assigned region
- **THEN** the system rejects the mutation without changing store data

### Requirement: Beacon management is protected and scoped
The system SHALL protect beacon creation, update, archive, assignment, release, and listing workflows and SHALL apply role and store/region scope checks.

#### Scenario: Admin assigns beacon
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** an authenticated `admin` assigns an active beacon to a store
- **THEN** the system records the assignment according to existing beacon validation rules

#### Scenario: Store manager edits another store beacon
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** a `store-manager` attempts to assign, release, update, or archive beacon data outside the assigned store
- **THEN** the system rejects the mutation without exposing unrelated beacon data

### Requirement: Admin layout management is protected and scoped
The system SHALL protect admin layout routes under `/api/stores/{storeId}/layout/*` and SHALL enforce that users can only manage layouts for stores allowed by their role and assignment.

#### Scenario: Store manager opens assigned layout
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** a `store-manager` requests the admin layout editor data for the assigned store
- **THEN** the system returns the layout data needed by the editor

#### Scenario: Store manager opens another store layout
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** a `store-manager` requests admin layout data for another store
- **THEN** the system rejects the request without returning layout details

### Requirement: Audit logs are admin-visible operational history
The system SHALL provide protected audit log access for users whose role allows operational history inspection.

#### Scenario: Admin opens audit logs
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** an authenticated `admin` requests `/api/admin/logs`
- **THEN** the system returns audit log data according to existing pagination or filters

#### Scenario: Non-admin requests audit logs
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** an authenticated user without sufficient log permissions requests audit logs
- **THEN** the system rejects the request without returning audit history

### Requirement: Error logs are protected diagnostics
The system SHALL provide protected error log access for users whose role allows diagnostics inspection and SHALL avoid exposing error diagnostics through anonymous routes.

#### Scenario: Admin opens error logs
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** an authenticated `admin` requests `/api/admin/error-logs`
- **THEN** the system returns error log data according to existing pagination or filters

#### Scenario: Anonymous user requests error logs
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** an anonymous user requests `/api/admin/error-logs`
- **THEN** the system rejects the request and returns no diagnostics data

### Requirement: Admin UI handles authorization state explicitly
The Admin Platform SHALL display identity, role, scope, loading, denied, and empty states without rendering stale protected data after a 401 or 403 response.

#### Scenario: Current user loads successfully
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** the Admin UI loads the current authenticated user's identity and access assignment
- **THEN** the UI displays the user's username, email or fallback identifier, role, and relevant region/store scope

#### Scenario: Protected fetch receives 403
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** a protected admin API request returns a 403 authorization failure
- **THEN** the UI shows an access denied state for the affected view instead of silently keeping partial or previous data

### Requirement: Archive semantics are preferred over destructive deletion
The system SHALL prefer archive/status-based lifecycle transitions for managed admin records where the domain model supports archiving, so historical relationships remain inspectable.

#### Scenario: Store is archived
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** an authorized admin archives a store
- **THEN** the store is excluded from active workflows according to existing filters without requiring hard deletion

#### Scenario: Beacon is archived
- **GIVEN** the Admin Platform management surface and role/scope context are available
- **WHEN** an authorized admin archives a beacon
- **THEN** mobile detection excludes the archived beacon from active identity responses

### Requirement: Admin dashboard summarizes operational state
The Admin Platform SHALL provide dashboard/status information for active regions, active stores, free beacons, assigned beacons, and recent system actions where the user's role allows access.

#### Scenario: Authorized admin opens dashboard
- **GIVEN** an authenticated admin user has permission for dashboard data
- **WHEN** the Admin Platform loads
- **THEN** it shows high-level operational counts and recent system activity

#### Scenario: Scoped user opens dashboard
- **GIVEN** an authenticated scoped user opens the Admin Platform
- **WHEN** dashboard data is loaded
- **THEN** counts and links respect the user's role and scope

### Requirement: Store and beacon lists support filters
The Admin Platform SHALL support practical list filtering for store and beacon management workflows.

#### Scenario: Stores are filtered
- **GIVEN** an authorized user can view stores
- **WHEN** the user filters by query, region, status, page, or size
- **THEN** the backend returns the matching scoped store list

#### Scenario: Beacons are filtered
- **GIVEN** an authorized user can view beacons
- **WHEN** the user filters by status, assignment state, store, or search query
- **THEN** the backend returns matching scoped beacon data

### Requirement: Store detail exposes related operational data
The Admin Platform SHALL expose store detail data that includes store metadata, active beacon assignments, layout versions, and audit history where allowed.

#### Scenario: Store detail is opened
- **GIVEN** an authorized user opens a store inside their scope
- **WHEN** the store detail view loads
- **THEN** the UI can show store metadata, assigned beacons, layout versions, and relevant audit history

#### Scenario: Store is outside scope
- **GIVEN** a scoped user requests a store outside their assignment
- **WHEN** the backend evaluates the request
- **THEN** protected store detail and related operational data are not returned

### Requirement: Beacon validation protects identity consistency
The backend SHALL validate beacon identity input so `uuid` is required, `beaconCode` is unique, identity keys are unique, and `major`/`minor` are either both supplied or both absent.

#### Scenario: Major without minor is submitted
- **GIVEN** a beacon create or update request includes `major` but omits `minor`
- **WHEN** the backend validates the request
- **THEN** it rejects the request with a bad-request error

#### Scenario: Duplicate identity is submitted
- **GIVEN** another beacon already uses the same identity key
- **WHEN** a beacon create or update request would duplicate it
- **THEN** the backend rejects the mutation

### Requirement: Store archival ends active beacon assignments
The Admin Platform SHALL end active beacon assignments when a store is archived so archived stores do not remain active mobile detection targets.

#### Scenario: Store is archived
- **GIVEN** a store has active beacon assignments
- **WHEN** an authorized user archives the store
- **THEN** the system ends active assignments for that store as part of archive handling

#### Scenario: Mobile detection runs after archive
- **GIVEN** a store has been archived
- **WHEN** mobile detection evaluates beacon assignments
- **THEN** archived store/beacon relationships are excluded from active customer detection

### Requirement: Error log page exposes diagnostics safely
The Admin Platform SHALL provide a protected server-log/error-log page that lists recent API errors and allows stack trace inspection for authorized users.

#### Scenario: Admin opens server logs
- **GIVEN** an authenticated `admin` opens `/admin/server-logs/`
- **WHEN** the page loads error log data
- **THEN** recent status code, method, path, message, type, and diagnostic details are visible

#### Scenario: Anonymous user opens server logs
- **GIVEN** an anonymous user requests the server-log page or API
- **WHEN** Keycloak protection is active
- **THEN** the system does not expose protected diagnostic data

### Requirement: Admin frontend consumes error responses once
The Admin UI SHALL handle API error response bodies without consuming the same response stream multiple times.

#### Scenario: API returns validation error
- **GIVEN** an admin mutation returns a structured or textual error response
- **WHEN** the frontend displays the error
- **THEN** it reads and presents the error without triggering body-consumed failures

### Requirement: Admin product management is available in the Admin Platform
The Admin Platform SHALL provide a product management surface that lets authorized admins create, update, or delete product catalog documents with product id, name, price, and layout code.

#### Scenario: Admin creates product
- **GIVEN** an authenticated user with the `admin` role and an active Indooro admin assignment opens the Admin Platform
- **WHEN** the user submits a valid product with id, name, price, and layout code
- **THEN** the Admin Platform sends the product to the protected admin product API and shows a success state after the product is indexed

#### Scenario: Admin deletes product
- **GIVEN** an authenticated user with the `admin` role sees a product in the Admin Platform product list
- **WHEN** the user confirms deletion for that product
- **THEN** the Admin Platform sends a delete request to the protected admin product API and removes the product from the list after the product document is deleted

#### Scenario: Product form is incomplete
- **GIVEN** an authenticated admin is using the product management form
- **WHEN** the user submits a product without a required field or with a negative price
- **THEN** the system rejects the submission and keeps the existing catalog unchanged

#### Scenario: Non-admin opens Admin Platform
- **GIVEN** an authenticated `region-manager` or `store-manager` opens the Admin Platform
- **WHEN** role-aware UI state is applied
- **THEN** product management navigation and product mutation controls are not displayed

### Requirement: Admin store management supports coordinates
The Admin Platform SHALL allow optional latitude and longitude values to be maintained for stores and SHALL validate geographic ranges before persisting them.

#### Scenario: Admin saves valid coordinates
- **GIVEN** an authorized admin or scoped manager can update a store
- **WHEN** they submit latitude between -90 and 90 and longitude between -180 and 180
- **THEN** the backend persists the coordinates with the store

#### Scenario: Admin submits invalid coordinates
- **GIVEN** an authorized admin or scoped manager can update a store
- **WHEN** latitude or longitude is outside the valid range
- **THEN** the backend rejects the store mutation without changing stored coordinates

#### Scenario: Store coordinates are optional
- **GIVEN** a store is created before exact coordinates are known
- **WHEN** the admin leaves latitude and longitude empty
- **THEN** the store can still be saved, but mobile store maps do not render a fake production pin for it

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

### Requirement: Admin Platform presents a task-focused operations shell
The Admin Platform SHALL present a consistent operations shell with persistent navigation, page title, breadcrumbs or equivalent location context, current user identity, role/scope display, logout, and page-scoped primary actions.

#### Scenario: Staff navigates the redesigned platform
- **WHEN** an authenticated staff user opens any redesigned Admin Platform page under `/admin/`
- **THEN** the UI shows where the user is, which role/scope is active, which top-level page is selected, and which primary action is available for that page

#### Scenario: Scoped staff opens a page
- **WHEN** a `region-manager` or `store-manager` opens the redesigned Admin Platform
- **THEN** navigation, actions, links, and empty states reflect the user's allowed scope without exposing admin-only workflows

### Requirement: Admin Platform uses page-specific information architecture
The Admin Platform SHALL use explicit pages and page-specific data loading for dashboard, regions, stores, store detail, beacons, products, recipes, server logs, and the layout editor instead of duplicating one full management surface behind route-specific visibility toggles.

#### Scenario: Staff opens a management page directly
- **WHEN** an authenticated staff user opens `/admin/stores/`, `/admin/beacons/`, `/admin/products/`, `/admin/recipes/`, or another redesigned admin page directly
- **THEN** only that page's shell, data dependencies, controls, loading states, and error states are initialized

#### Scenario: Page modules are inspected
- **WHEN** a developer reviews the redesigned Admin Platform frontend
- **THEN** page modules, shared shell utilities, API clients, component primitives, and workflow-specific code are separated enough that unrelated workflows do not require editing one monolithic script

### Requirement: Dashboard provides an operational overview
The redesigned dashboard SHALL provide a concise operational overview with role-scoped KPIs, relevant setup warnings, recent audit events, and quick actions rather than acting as a management onepager.

#### Scenario: Admin opens dashboard
- **WHEN** an `admin` opens `/admin/`
- **THEN** the dashboard shows high-signal counts and recent operational activity with links to the relevant management pages

#### Scenario: Store manager opens dashboard
- **WHEN** a `store-manager` opens `/admin/`
- **THEN** the dashboard summarizes only the assigned store context and offers next actions allowed for that store

### Requirement: Store management separates list, detail, and edit workflows
The redesigned Store Management UI SHALL separate store listing, store detail, store creation/editing, layout versions, beacon assignments, and audit history into clear page sections or tabs with explicit navigation between them.

#### Scenario: Staff reviews stores
- **WHEN** staff opens the store list
- **THEN** stores can be searched, filtered, sorted, paginated where applicable, and opened into a detail view without mixing the create/edit form into the default list scanning area

#### Scenario: Staff edits store data
- **WHEN** staff creates or edits a store
- **THEN** the form is grouped into meaningful sections or steps for identity, region, address, coordinates, notes, and review/confirmation

#### Scenario: Staff opens store detail
- **WHEN** staff opens `/admin/stores/detail/?storeId=<id>`
- **THEN** the detail view shows store metadata, active beacon assignments, layout versions, audit history, and context-aware links to the layout editor

### Requirement: Beacon management supports assignment workflows
The redesigned Beacon Management UI SHALL make free, assigned, archived, invalid, and ambiguous beacon states explicit and SHALL guide assignment, release, and archive actions through store-aware workflows.

#### Scenario: Staff assigns a beacon
- **WHEN** staff starts a beacon assignment
- **THEN** the UI shows eligible target stores, current assignment state, validation feedback, and a confirmation step before mutating the assignment

#### Scenario: Beacon identity is invalid
- **WHEN** staff enters a beacon UUID, major, or minor combination that fails current backend validation rules
- **THEN** the UI presents inline validation and does not allow the user to mistake the beacon as assignable

### Requirement: Product and recipe admin workflows are structured
The redesigned Admin Platform SHALL provide structured product, category, import, recipe, ingredient, step, tag, product-mapping, preview, publish, deactivate, and archive workflows where those features exist for the current role.

#### Scenario: Admin manages products
- **WHEN** an `admin` opens product management
- **THEN** the UI provides product search/filter/sort, create/edit/detail actions, layout-code readiness feedback, destructive-action confirmation, and clear success/error states

#### Scenario: Admin imports products
- **WHEN** an `admin` imports or bulk-updates product data
- **THEN** the UI guides file selection, parsing/review, validation, conflict handling, submit progress, and post-import summary before data is treated as ready

#### Scenario: Admin edits a recipe
- **WHEN** an `admin` edits a recipe
- **THEN** recipe metadata, ingredients, steps, tags, product mappings, preview, and publish readiness are separated into a guided detail workflow

### Requirement: Admin Platform uses a coherent component and state system
The redesigned Admin Platform SHALL define and apply a consistent design system for typography, spacing, color tokens, icons, buttons, inputs, form groups, tables, lists, tabs, dialogs, toasts, empty states, loading states, validation states, error states, and permission states.

#### Scenario: A list has no rows
- **WHEN** a redesigned admin list has no rows because of scope, filters, or missing data
- **THEN** the UI shows an empty state with the reason and the next allowed action instead of a blank region or misleading success state

#### Scenario: A mutation fails
- **WHEN** a redesigned admin mutation returns validation, conflict, authorization, or server failure
- **THEN** the UI shows the failure near the affected workflow and does not keep stale protected data as if the action succeeded

#### Scenario: The viewport is narrow
- **WHEN** staff uses the redesigned Admin Platform on notebook or tablet-sized viewports
- **THEN** navigation, forms, tables, and tool panels remain usable without requiring a hard desktop-only minimum width for ordinary admin pages

### Requirement: Critical admin actions are protected by confirmation and recovery cues
The redesigned Admin Platform SHALL distinguish reversible edits from critical actions such as archive, release, delete, publish, deactivate, import, index reset, and layout publish, and SHALL provide confirmation, validation, and post-action feedback appropriate to the action risk.

#### Scenario: Staff archives a managed record
- **WHEN** staff activates an archive action for a region, store, beacon, product, or recipe where supported
- **THEN** the UI states the effect of the action, asks for confirmation, submits through the existing protected API, and shows the resulting state after the backend confirms it

#### Scenario: Staff cancels a critical action
- **WHEN** staff cancels a critical action confirmation
- **THEN** no mutation request is sent and the user returns to the prior workflow context

### Requirement: Admin recipe management is protected
The Admin Platform SHALL expose recipe management only to authenticated users with sufficient recipe administration permissions and SHALL keep mobile recipe read routes separate from protected admin mutation routes.

#### Scenario: Admin opens recipe management
- **GIVEN** an authenticated `admin` with an active Indooro assignment opens the Admin Platform
- **WHEN** role-aware UI state is applied
- **THEN** recipe management navigation and mutation controls are available

#### Scenario: Anonymous user requests recipe admin API
- **GIVEN** recipe admin APIs exist under `/api/admin/recipes`
- **WHEN** an anonymous user requests a protected recipe admin route
- **THEN** the system rejects the request without exposing protected recipe management data

#### Scenario: Non-admin opens Admin Platform
- **GIVEN** an authenticated `region-manager` or `store-manager` opens the Admin Platform in the MVP
- **WHEN** role-aware UI state is applied
- **THEN** recipe mutation controls are hidden unless a future change defines scoped recipe permissions

### Requirement: Admins can maintain recipe content
The Admin Platform SHALL let authorized admins create, edit, list, preview, publish, deactivate, and archive recipes with ingredients, ordered steps, tags, portions, times, and optional image metadata.

#### Scenario: Admin creates recipe
- **GIVEN** an authorized admin enters valid recipe metadata, at least one ingredient, and at least one step
- **WHEN** the admin saves the recipe
- **THEN** the backend persists the recipe as a draft or published record according to the requested status

#### Scenario: Required content is missing
- **GIVEN** an authorized admin submits a recipe without a title, ingredient, or step
- **WHEN** the backend validates the request
- **THEN** it rejects the mutation and keeps existing recipe data unchanged

#### Scenario: Admin deactivates recipe
- **GIVEN** a recipe is published
- **WHEN** an authorized admin deactivates or archives it
- **THEN** the recipe is excluded from anonymous mobile recipe list/search/detail routes

### Requirement: Admins can maintain recipe tags and categories
The Admin Platform SHALL let authorized admins manage recipe tags/categories and assign them to recipes for mobile display and filtering.

#### Scenario: Tag is assigned to recipe
- **GIVEN** an authorized admin edits a recipe
- **WHEN** the admin selects an existing tag
- **THEN** the recipe detail and mobile summary can include that tag

#### Scenario: Duplicate tag code is submitted
- **GIVEN** a tag code already exists
- **WHEN** an admin submits another tag with that code
- **THEN** the backend rejects the duplicate tag identity

### Requirement: Admins can manage ingredient product mappings
The Admin Platform SHALL let authorized admins map recipe ingredients to catalog products, review mapping status, select among multiple candidates, and manually confirm mappings.

#### Scenario: Admin maps ingredient to product
- **GIVEN** an ingredient has no confirmed mapping
- **WHEN** an admin searches catalog products and chooses one product for the ingredient
- **THEN** the backend stores an active mapping with product id, product snapshot fields, mapping type, confidence, manual confirmation state, and optional store scope

#### Scenario: Multiple mapping candidates exist
- **GIVEN** an ingredient such as milk has multiple candidate products
- **WHEN** the admin reviews mapping suggestions
- **THEN** the UI presents candidates for manual selection instead of auto-publishing an ambiguous mapping

#### Scenario: Product has no layout position
- **GIVEN** an admin maps an ingredient to a product without a usable layout code
- **WHEN** the mapping is saved or previewed
- **THEN** the Admin Platform marks the mapping as non-routable or incomplete so the admin can correct it

### Requirement: Mapping suggestions are reviewable and bounded
The backend SHALL provide mapping suggestions based on product search, category hints, normalized ingredient names, and optional synonyms, but SHALL require explicit status and confidence in suggestion responses.

#### Scenario: Suggestion endpoint is called
- **GIVEN** an authorized admin requests suggestions for an ingredient
- **WHEN** the backend searches catalog products
- **THEN** the response returns a bounded candidate list with product fields, confidence, reason, and store context where supplied

#### Scenario: No suggestion is safe
- **GIVEN** the backend cannot find a confident product candidate
- **WHEN** suggestions are requested
- **THEN** the response is empty or marked low-confidence and no mapping is created automatically

### Requirement: Admin preview exposes recipe mobile readiness
The Admin Platform SHALL provide a preview or readiness state that shows whether a recipe is publishable and which ingredients are mapped, ambiguous, unmapped, unavailable in a selected store, or mapped to products without layout positions.

#### Scenario: Admin previews recipe
- **GIVEN** a recipe has mixed mapping states
- **WHEN** the admin opens the recipe preview
- **THEN** the UI shows the mobile-facing recipe content and ingredient mapping readiness before publish

#### Scenario: Publish validation fails
- **GIVEN** a recipe has invalid core content
- **WHEN** an admin attempts to publish it
- **THEN** the backend rejects publish and returns validation details that the Admin UI can show without consuming the response body multiple times

### Requirement: Admin Recipe Mapping uses searchable product controls
The Admin Platform recipe mapping workflow SHALL provide a searchable product selection control for ingredient mappings and SHALL prevent saving arbitrary product names as mappings.

#### Scenario: Recipe mapping drawer opens
- **WHEN** an authenticated admin opens the recipe ingredient mapping drawer
- **THEN** each ingredient mapping panel exposes a product search/selection control instead of requiring manual product text entry

#### Scenario: Admin saves without selected product
- **WHEN** an admin types search text but has not selected a product result
- **THEN** the UI does not submit a mapping confirmation

#### Scenario: Existing mapping has product data
- **WHEN** an ingredient already has an active mapping
- **THEN** the mapping panel shows the confirmed product identity and allows the admin to search for a replacement or archive the mapping through existing mapping lifecycle behavior

