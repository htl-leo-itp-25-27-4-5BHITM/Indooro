## ADDED Requirements

### Requirement: Admin dashboard is a build-free static module application
The Admin Platform UI SHALL be served by Quarkus as static resources from `backend/indooro_server/src/main/resources/META-INF/resources/admin/` without a bundler or package runtime. Each page entry (`/admin/`, `/admin/regions/`, `/admin/stores/`, `/admin/stores/detail/`, `/admin/beacons/`, `/admin/products/`, `/admin/categories/`, `/admin/recipes/`, `/admin/server-logs/`) SHALL load the ES module `/admin/app.js`, and `/admin/editor/` SHALL load `/admin/editor.js`. Pure, DOM-free logic SHALL live in `core.js` and `editor-core.js` so that it can be tested with `node --test`.

#### Scenario: A page entry is opened
- **GIVEN** an authenticated admin session
- **WHEN** the browser requests `/admin/stores/`
- **THEN** the HTML loads `/admin/app.js` as a module and the router selects the `stores` route from the path

#### Scenario: Pure logic is changed
- **GIVEN** a change modifies validation or payload building
- **WHEN** the change is implemented
- **THEN** the logic lives in `core.js` or `editor-core.js` and is covered by `npm run admin:test`

### Requirement: Admin navigation is role-aware
The Admin UI SHALL render only navigation entries whose route role list contains one of the current user's roles, and SHALL render an access-denied view when a user opens a route outside the allowed roles. The route role matrix SHALL be: Dashboard, Stores, Beacons, Layout Editor for `admin`, `region-manager`, `store-manager`; Regionen for `admin`, `region-manager`; Produkte, Kategorien, Rezepte, Diagnose for `admin` only. Backend authorization SHALL remain authoritative regardless of the navigation state.

#### Scenario: Store manager opens the admin shell
- **GIVEN** a user with role `store-manager`
- **WHEN** the shell renders
- **THEN** the navigation shows Dashboard, Stores, Beacons, and Layout Editor only

#### Scenario: Store manager opens the products page directly
- **GIVEN** a user with role `store-manager`
- **WHEN** the user navigates to `/admin/products/`
- **THEN** the UI shows the access-denied view and does not request product data

### Requirement: Admin UI bootstraps from the current-user endpoint
Before rendering any route, the Admin UI SHALL request `GET /api/admin/me` with same-origin credentials, SHALL display the username and the role/scope summary from the response, SHALL redirect to `/admin/` when any API call returns 401, and SHALL show the message „Kein Zugriff auf diesen Workflow.“ when an API call returns 403.

#### Scenario: Session is valid
- **GIVEN** a valid OIDC session with an active Indooro access assignment
- **WHEN** the Admin UI starts
- **THEN** the sidebar shows the username and a scope summary such as `store-manager · <store name>`

#### Scenario: Session has expired
- **GIVEN** an expired session
- **WHEN** any admin API call returns 401
- **THEN** the browser navigates to `/admin/`, which triggers the OIDC login

### Requirement: Dashboard shows operational readiness in scope
The dashboard SHALL show the number of regions, stores, free (unassigned, non-archived) beacons, and stores without an active layout within the user's scope, SHALL list setup warnings for missing layouts and free beacons, SHALL show up to eight recent audit events for `admin` users, and SHALL offer quick actions to stores, beacons, and (for `admin`) products and recipes.

#### Scenario: Admin opens the dashboard
- **GIVEN** an `admin` user
- **WHEN** the dashboard renders
- **THEN** it shows the four readiness metrics, the setup warnings, and the latest audit events

#### Scenario: Region manager opens the dashboard
- **GIVEN** a `region-manager` user
- **WHEN** the dashboard renders
- **THEN** it does not request `/api/admin/logs` and shows no audit event panel content

### Requirement: Admin data tables expose defined columns, filters, and sort keys
The Admin UI SHALL provide the following tables with the listed columns, filters, and sort keys:
- Regionen: Code, Name, Status, Aktionen; text search on name/code.
- Stores: Store, Region, Ort, Beacons, Layout, Aktionen; text search on name/storeCode/city/region name; filters Region and Layout (Aktiv/Fehlt); sort by Name, Code, Stadt; 25 rows per page.
- Beacons: Beacon, Identität, Status, Store, Aktionen; text search on beaconCode/uuid/identityKey/store name; filter Status (Frei, Zugewiesen, Archiviert); sort by Code, UUID, Store.
- Produkte: ID, Produkt, Preis, Layout, Store, Readiness, Aktionen; text search on id/name/layoutCode/storeCode; filter Readiness (Routbar, Nicht routbar); sort by Name, ID, Layout-Code; 30 rows per page.
- Kategorien: Code, Name, Aktionen.
- Rezepte: Rezept, Status, Mapping, Tags, Aktionen; text search on title/slug/status; filter Status (Draft, Published, Archived); sort by Titel, Status, Publiziert.
Every dynamic cell value SHALL be HTML-escaped before insertion.

#### Scenario: Stores are filtered by text
- **GIVEN** the Stores table is loaded
- **WHEN** the user types „Leonding“ into the search field
- **THEN** only rows whose name, store code, city, or region name contain the text case-insensitively remain

#### Scenario: A store name contains markup
- **GIVEN** a store named `<b>Test</b>`
- **WHEN** the Stores table renders
- **THEN** the name is displayed as literal text and no element is created from it

### Requirement: Destructive admin actions require confirmation
The Admin UI SHALL ask for explicit confirmation in a dialog before archiving regions, stores, beacons, or recipes, releasing beacons, publishing or deactivating recipes, and deleting products, and SHALL refresh the affected view after the action completes.

#### Scenario: Admin archives a beacon
- **GIVEN** the Beacons table shows beacon `B-001`
- **WHEN** the admin clicks „Archivieren“
- **THEN** a dialog asks „B-001 archivieren?“ and the archive request is sent only after „Bestaetigen“

#### Scenario: Admin cancels a deletion
- **GIVEN** the delete dialog for a product is open
- **WHEN** the admin clicks „Abbrechen“
- **THEN** no request is sent and the dialog closes

### Requirement: Admin bulk actions use explicit parse-then-commit flows
The Admin UI SHALL support bulk beacon creation with one shared UUID, one shared major value, and one `beaconCode,minor` pair per line sent to `POST /api/beacons/bulk`, and SHALL support product and category imports from either a JSON array or newline-delimited JSON sent to the category or product bulk endpoints. The UI SHALL parse all input before sending, SHALL abort without sending when parsing fails or no records are found, and SHALL report the number of committed records.

#### Scenario: Beacon bulk input contains an invalid line
- **GIVEN** the bulk drawer contains the line `B-004,abc`
- **WHEN** the admin submits
- **THEN** the UI shows „Bulk-Review fehlgeschlagen“ and sends no request

#### Scenario: Category import succeeds
- **GIVEN** the import drawer contains `[{"categoryCode":310,"categoryName":"Obst & Gemüse"}]`
- **WHEN** the admin submits
- **THEN** the UI sends the array to `POST /api/categories/bulk` and reports one imported record

### Requirement: Admin forms validate before submitting
The Admin UI SHALL validate store forms (region, store code, name, street, zip code, city, and country required; latitude within ±90; longitude within ±180), beacon forms (code and UUID required; UUID made of 8 to 40 hexadecimal or hyphen characters; major and minor not negative; UUID/major/minor unique among loaded beacons), product forms (positive integer id, name, non-negative price, layout code), and recipe forms (slug, title, servings of at least 1; for new recipes at least one ingredient with a selected catalog product and one step) and SHALL show the collected messages without sending a request. The backend SHALL remain the authoritative validator.

#### Scenario: Beacon minor is negative
- **GIVEN** the beacon drawer with minor `-1`
- **WHEN** the user submits
- **THEN** the message „Minor darf nicht negativ sein.“ is shown and no request is sent

#### Scenario: Product price is negative
- **GIVEN** the product drawer with price `-1`
- **WHEN** the user submits
- **THEN** the message „Preis darf nicht negativ sein.“ is shown and no request is sent

### Requirement: Recipe workflows are available to admins
The Admin UI SHALL let `admin` users create recipes with metadata, catalog-backed ingredients, and ordered steps in one request, SHALL confirm the selected product for each new ingredient through the product-mapping endpoint, SHALL provide a mapping drawer that shows each ingredient's mapping status, searches mapping suggestions, and confirms or archives mappings, and SHALL provide publish, deactivate, and archive actions. Detailed backend rules are defined in `admin-platform-management` and, once `add-recipe-shopping-list-integration` is archived, in `recipe-catalog-shopping`.

#### Scenario: Admin creates a recipe
- **GIVEN** a recipe form with slug, title, servings, one ingredient bound to product 101, and one step
- **WHEN** the admin saves
- **THEN** the UI sends `POST /api/admin/recipes` and afterwards `PUT /api/admin/recipes/{recipeId}/ingredients/{ingredientId}/product-mapping` for the ingredient

#### Scenario: Admin opens the mapping drawer
- **GIVEN** a recipe in the list
- **WHEN** the admin clicks „Mapping“
- **THEN** the drawer loads `GET /api/admin/recipes/{recipeId}/mapping-status` and shows one panel per ingredient

### Requirement: Layout editor distinguishes store mode and legacy mode
The layout editor SHALL operate in store mode when the URL contains `storeId`, loading `GET /api/stores/{storeId}/layout/editor-context` and saving to `POST /api/stores/{storeId}/layout/versions`, and SHALL restrict beacon elements to the beacons assigned to that store. Without `storeId`, the editor SHALL operate in legacy mode against `/api/layout/current`. The editor SHALL keep an undo/redo history of at most 50 states and SHALL validate layouts with `validateLayoutDocument`, reporting errors for empty layouts, elements outside the area, beacons without identity, and duplicate beacon placement, and warnings for a missing shop name, missing grid size, missing entrance, shelves or points of interest without category or layout code, and assigned beacons that are not placed. Detailed layout rules are defined in `store-layout-management`.

#### Scenario: Editor opens with a store context
- **GIVEN** `/admin/editor/?storeId=<id>` for a store with two assigned beacons
- **WHEN** the editor loads
- **THEN** the beacon selector offers only those two beacons

#### Scenario: A beacon is placed twice
- **GIVEN** a layout that contains beacon `B-001` at two positions
- **WHEN** the user runs validation
- **THEN** the validation panel shows the error „Beacon B-001 ist mehrfach platziert.“

### Requirement: Diagnostics page is admin-only
The Admin UI SHALL provide the Diagnose page only to `admin` users, SHALL show recent audit events from `GET /api/admin/logs` and up to 30 error log entries from `GET /api/admin/error-logs` with expandable, escaped stack traces, and SHALL offer a manual refresh.

#### Scenario: Admin inspects an error
- **GIVEN** an error log entry with a stack trace
- **WHEN** the admin expands the entry
- **THEN** the stack trace is shown as preformatted, escaped text

#### Scenario: Region manager requests diagnostics
- **GIVEN** a `region-manager` user
- **WHEN** the user opens `/admin/server-logs/`
- **THEN** the UI shows the access-denied view
