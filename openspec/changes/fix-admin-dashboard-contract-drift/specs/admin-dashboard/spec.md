## ADDED Requirements

### Requirement: Admin logout uses the configured OIDC logout path
The Admin UI logout action SHALL navigate to `/admin/logout`, the path configured as `quarkus.oidc.logout.path`, so that the Quarkus session ends and Keycloak logout is triggered.

#### Scenario: Admin logs out
- **GIVEN** an authenticated admin session
- **WHEN** the admin clicks „Logout“
- **THEN** the browser requests `/admin/logout` and a subsequent request to `/admin/` redirects to the Keycloak login

#### Scenario: Logout target is tested
- **GIVEN** the admin smoke tests
- **WHEN** the logout button is clicked
- **THEN** the test observes navigation to `/admin/logout`

### Requirement: Recipe editing preserves unchanged data
Before opening the edit drawer, the Admin UI SHALL load the full recipe with `GET /api/admin/recipes/{recipeId}`, SHALL pre-fill metadata, image fields, tags, ingredients, and steps from it, SHALL send every metadata field including `imageUrl`, `imageAlt`, and the current `tagIds` on save, and SHALL persist added, changed, and removed ingredients and steps through the ingredient and step endpoints.

#### Scenario: Admin edits only the title
- **GIVEN** the seeded recipe „Apfel-Hafer-Crumble“ with image, description, and two tags
- **WHEN** the admin changes the title and saves
- **THEN** the recipe keeps its image, description, and both tags

#### Scenario: Admin removes an ingredient
- **GIVEN** a recipe with three ingredients
- **WHEN** the admin removes the second ingredient in the edit drawer and saves
- **THEN** the UI calls `DELETE /api/admin/recipes/{recipeId}/ingredients/{ingredientId}` and the reloaded recipe has two ingredients

### Requirement: Admin lists page, search, and filter on the server
The Stores, Rezepte, and Produkte pages SHALL request data page by page from the backend with the current search text, filters, page number, and page size, SHALL display the backend `totalElements`, and SHALL apply filters before pagination. The Kategorien page SHALL request at most the backend maximum of 500 categories and SHALL show a notice when the limit is reached.

#### Scenario: More than 20 recipes exist
- **GIVEN** 26 recipes
- **WHEN** the admin opens Rezepte and moves to page 2 with a page size of 20
- **THEN** the page shows recipes 21 to 26 and the total count 26

#### Scenario: Stores are filtered by region
- **GIVEN** 40 stores, 5 of them in region „Oberösterreich“
- **WHEN** the admin selects that region
- **THEN** the UI requests `/api/stores?regionId=<id>&page=0&size=25` and shows 5 stores with total 5

### Requirement: Product readiness accepts the documented layout-code format
The Admin UI SHALL classify a product as routable when its layout code matches `<categoryCode>/<meter>/<level>/<position>` with numeric parts, SHALL flag other non-empty codes as unclear, and SHALL use `310/1/1/1` as the example value in forms, mocks, and tests. Empty numeric form fields SHALL be sent as `null`.

#### Scenario: A standard layout code is shown
- **GIVEN** a product with layout code `310/1/1/1` and store code `SPAR-Leonding-001`
- **WHEN** the product table renders
- **THEN** the readiness badge shows „Routbar“ without problems

#### Scenario: Bulk beacons are created without major
- **GIVEN** the beacon bulk drawer with an empty major field
- **WHEN** the admin submits
- **THEN** the request body contains `"major": null`

### Requirement: Layout version and recipe readiness reflect backend fields
The store detail page SHALL mark a layout version as active when its `status` is `ACTIVE`, and the recipe list SHALL warn „Keine Schritte“ when the summary `stepCount` is 0.

#### Scenario: Store detail shows versions
- **GIVEN** a store with versions 1 (`ARCHIVED`) and 2 (`ACTIVE`)
- **WHEN** the store detail page renders
- **THEN** version 2 carries the badge „Aktiv“ and version 1 does not

#### Scenario: A recipe has no steps
- **GIVEN** a draft recipe with ingredients and `stepCount` 0
- **WHEN** the recipe list renders
- **THEN** the readiness column contains „Keine Schritte“

### Requirement: Admin mutations report failures and prevent double submission
Every Admin UI mutation SHALL disable its submit or confirm button while the request runs, SHALL show a danger toast and an inline message with the backend `error` text on failure, SHALL keep the drawer or dialog open on failure, and SHALL close it only on success. Every drawer form SHALL display its validation messages.

#### Scenario: Archiving fails
- **GIVEN** the backend answers an archive request with 403
- **WHEN** the admin confirms the dialog
- **THEN** the dialog stays open, the button is re-enabled, and the message „Kein Zugriff auf diesen Workflow.“ is shown

#### Scenario: Store form is incomplete
- **GIVEN** the store drawer without a city
- **WHEN** the admin clicks „Speichern“
- **THEN** the message „Stadt ist erforderlich.“ is shown and no request is sent

### Requirement: Admin list input stays responsive
The Admin UI SHALL debounce search input by at least 200 ms, SHALL re-render only the table region while keeping focus and cursor position in the search field, SHALL release action handlers from previous renders, and SHALL change client-side pages without new API requests.

#### Scenario: Admin types a search term
- **GIVEN** the Beacons page
- **WHEN** the admin types „B-00“ quickly
- **THEN** the table updates once after typing pauses and the search field keeps focus with the cursor at the end

#### Scenario: Admin re-renders a page many times
- **GIVEN** the Beacons page has been re-rendered 100 times
- **WHEN** the action registry size is inspected in a test
- **THEN** it contains only the handlers of the current render

### Requirement: Admin dialogs are accessible
Drawers and confirmation dialogs SHALL expose `role="dialog"`, `aria-modal="true"`, and an accessible name, SHALL move focus into the dialog when opened, SHALL return focus to the triggering control when closed, and SHALL close with the Escape key. Filter controls SHALL have programmatically associated labels. Controls without behavior SHALL NOT be rendered.

#### Scenario: Keyboard user opens a drawer
- **GIVEN** focus on „Store anlegen“
- **WHEN** the user presses Enter and then Escape
- **THEN** focus moves into the drawer, the drawer closes on Escape, and focus returns to „Store anlegen“

#### Scenario: Screen reader reads a filter
- **GIVEN** the Stores page
- **WHEN** a screen reader focuses the region filter
- **THEN** it announces the label „Region“

### Requirement: Smoke-test mocks follow the shared contract
The admin smoke server SHALL return payloads that validate against the schemas in `openspec/specs/shared-api/openapi.yaml`, including `PageResponse.content` for paged lists, `LayoutVersionSummary.status`, and layout codes in the documented format.

#### Scenario: A mock payload drifts
- **GIVEN** a mock returns `items` instead of `content` for stores
- **WHEN** the contract check in the admin test suite runs
- **THEN** the check fails and names the offending mock

#### Scenario: Mocks are valid
- **GIVEN** the updated smoke server
- **WHEN** `npm run admin:verify` runs
- **THEN** the contract check and all Playwright tests pass
