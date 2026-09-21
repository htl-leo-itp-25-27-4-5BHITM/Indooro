## ADDED Requirements

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
