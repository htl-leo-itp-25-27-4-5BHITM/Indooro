# Admin route, action, API, role, scope, and state inventory

**2026-10-18 runtime addendum:** [`ADMIN_REBUILD_EVIDENCE_2026-10-18.md`](ADMIN_REBUILD_EVIDENCE_2026-10-18.md) records a fresh local packaged-stack run per route. Region, Store/detail (after paging fixtures), Beacon, Category, Dashboard, Diagnostics and Editor-focused probes passed; Product and Recipe probes hit the newly store-scoped Product API with old global fixture assumptions. This inventory remains partial for Task 1.2, and the Editor flag on this base is still `false` pending separate PR #153.

**Editor fixture update:** 2026-10-16 `admin-ui/scripts/live-editor-{parity,tools-parity,import-parity,export-semantics,states}.mjs` provide reproducible local browser/API fixtures for Store/global persistence and version rollback, candidate tools, import/export differences, no-active fallback, first private Draft, and injected context/history errors. `live-editor-role-actions.mjs` adds authenticated Region/Store Manager UI draft saves and foreign/global denial with temporary assignments restored afterward. `capture-editor-evidence.mjs` saves 14 screenshots and metadata under [`evidence/editor/`](evidence/editor/); [`EDITOR_ACTION_MATRIX.md`](EDITOR_ACTION_MATRIX.md) maps Legacy controls to Candidate paths and marks gaps. Focused and full candidate browser tests cover keyboard/focus and global publication recovery. The packaged three-role workflow and 57-check role matrix supply scoped denials. The current image's published Store response decodes through the actual Swift models. These checks still do not provide a screenshot for every action/state or a physical-device journey, so task 1.2 and the Editor gate remain open.

**Recipe cutover fixture update:** 2026-10-16 `admin-ui/scripts/live-recipes-parity.mjs` supplies disposable packaged-stack legacy/candidate create/edit and mapping, role/direct-link, keyboard preview/retry, multi-stage partial-write, publication visibility, tag/store mobile query and numeric title sort fixtures. It archives eight recipes and one tag and deletes two products. The old client filters only its first API page, so late Draft search is an observed legacy limit; the fixture uses a decreasing numeric title key to keep current test rows on that page. Recipe is enabled locally after its documented gate; Editor remains gated.

**Inventory update:** 2026-10-15 Product actions/states have a reproducible disposable packaged-stack fixture in `admin-ui/scripts/live-products-parity.mjs` and screenshots in `evidence/products/`. The rest of task 1.2 still lacks every-action/state fixtures.

**Evidence cut:** repository checkout on 2026-10-12. This is a source and test inventory, not a claim that all routes/actions were exercised against a running stack. The local stack prerequisites and runtime evidence are tracked in [`LIVE_STACK.md`](LIVE_STACK.md) and [`BASELINE.md`](BASELINE.md). Captured screens are linked below; they document rendered routes, not every action or state.

## Route topology and cutover status

Legacy static entries live at `backend/indooro_server/src/main/resources/META-INF/resources/admin`. Their pages share `app.js`/`core.js`; the editor and diagnostics also have page-specific scripts. The React/Vite source is `admin-ui/`, and package output is installed under `admin/next/`. The route map currently sends Dashboard, Regions, Stores, Store detail, Beacons, Products, Categories, Recipes, and Diagnostics to the candidate; Editor remains legacy. The dated source inventory below is supplemented by the authenticated parity records in `ROUTE_PARITY_MATRIX.md`.

| Workflow | Current protected static URL | Candidate URL | Candidate component | Direct-link/query contract |
| --- | --- | --- | --- | --- |
| Dashboard | `/admin/` | `/admin/next/` | `Dashboard` | Scoped counts and actions |
| Regions | `/admin/regions/` | `/admin/next/regions/` | `RegionsPage` | list/detail/edit state in page |
| Stores | `/admin/stores/` | `/admin/next/stores/` | `StoresPage` | list query and Name/Code/Stadt sort in URL; server paging |
| Store detail | `/admin/stores/detail/?storeId={uuid}` | `/admin/next/stores/detail/?storeId={uuid}` | `StoreDetailPage` | `storeId` required; `edit=1` opens the metadata form |
| Store create | drawer on `/admin/stores/` | `/admin/next/stores/new/` | `StoreCreatePage` | dedicated guided form |
| Beacons | `/admin/beacons/` | `/admin/next/beacons/` | `BeaconsPage` | optional `storeId` context |
| Products | `/admin/products/` | `/admin/next/products/` | `ProductsPage` | query, server paging, global readiness filter, Name/ID/Layout-Code sort |
| Categories | `/admin/categories/` | `/admin/next/categories/` | `CategoriesPage` | catalog/import workflow |
| Recipes | `/admin/recipes/` | `/admin/next/recipes/` | `RecipesPage` | filters and editor state |
| Diagnostics | `/admin/server-logs/` | `/admin/next/server-logs/` | `DiagnosticsPage` | admin-only logs |
| Store layout editor | `/admin/editor/?storeId={uuid}[&layoutId={uuid}]` | `/admin/next/editor/?storeId={uuid}[&layoutId={uuid}]` | `EditorRoute` | version selection by `layoutId` |
| Global legacy layout | `/admin/editor/` | `/admin/next/editor/` | `LegacyEditorRoute` | admin-only; optional `layoutId` history |

Legacy store detail entry physically exists at `/admin/stores/detail/`; route selection in `app.js` uses the shared stores renderer and query parameter. Candidate nested entries are generated for stores, store detail/new, editor, regions, beacons, recipes, products, categories, and server-logs. `admin-ui/src/routes.ts` currently maps top-level navigation to candidate paths, with editor special cases: store managers get their scoped store editor link; region managers go to stores; admins get global editor. Deep links still require package + OIDC verification before route switch.

## Role and scope boundary

Backend access is authoritative. `AdminAccessService` binds the Keycloak subject to one active database assignment and requires the matching Keycloak role. It applies region/store filters and checks each store mutation target. UI navigation is usability filtering only; an API denial is still expected for forged links or requests.

| Role | Intended data scope and route access | Write boundary evidenced in source |
| --- | --- | --- |
| `admin` | All regions/stores; all staff routes, products, recipes, diagnostics, global editor | Admin-only region mutations; unrestricted scoped domain mutations; catalog/recipe/log endpoints admin-only |
| `region-manager` | Assigned region and its stores; regions, stores, beacons, store editor | Can create/update/archive stores only in assigned region; region list/detail readable but region create/update/archive are `@RolesAllowed("admin")` |
| `store-manager` | Assigned store; stores/beacons and that store's editor; no catalog, recipe, diagnostics, region management or global editor | Cannot create stores; store mutation constrained to assigned store and same region; other store ids denied |

`candidateAccess` mirrors page-level role checks and explicitly denies a store manager whose requested editor/detail `storeId` differs from `/api/admin/me` scope. It allows the global editor only to admin. This client logic must not be treated as the security gate: confirm direct-link and API 401/403 behavior per role. Regions candidate exposes reads to region managers but should retain admin-only mutation controls, matching the REST annotations.

## Page parity and observable state inventory

| Route | Current actions and API behavior | Candidate actions/state and known parity considerations | Existing evidence |
| --- | --- | --- | --- |
| Dashboard | Reads regions, stores, beacons, plus admin audit; counts visible-scope totals, missing active layouts, free beacons; links to stores/editor/beacons and admin catalog/recipes/diagnostics. | `/api/admin/me` bootstrap; scoped server counts (`/api/stores?size=1`, `hasActiveLayout=false`), free beacons, admin recent activity; retry/error, setup warnings, role-specific links. Server-backed counts differ from legacy client-side totals and need parity assertion for paging/scope. | `admin-ui/src/Dashboard.tsx`; browser coverage in `candidate.spec.ts`; backend `/api/admin/me`, `/api/admin/logs`, `/api/regions`, `/api/stores`, `/api/beacons/free` |
| Regions | Search/table; create, edit, archive; archive confirmation. Reads `/api/regions`; writes POST, PUT, PATCH `/{regionId}/archive`. Legacy presents create/edit/archive affordances broadly although REST mutation annotations are admin-only. | Active/archived list, detail, create/edit form, validation, archive and reload/error states; candidate uses admin-only write controls. | `RegionsPage.test.ts`, `tests/browser/regions.spec.ts`; `RegionAdminResource` |
| Stores | Client-side search, region/layout filters, sorting, 25-row paging; create/edit drawer; detail deep link. | Server-backed query/paging/filter state, retry/empty/error; create form separate route; detail supports metadata, beacons, layout versions, audit, archive. Preserve old `storeId` links. | `StoresPage.test.ts`, `tests/browser/store-create.spec.ts`, `tests/browser/store-detail.spec.ts`; store query test and `/api/stores` page contract |
| Beacons | Search, state filters (free/assigned/archived), sort; create/edit, bulk create, assign, release, archive with confirmation. Bulk parses UUID/major/minor; identity key uniqueness matters. Optional `storeId` context in links. | Inventory, bulk parse/review/commit, identity validation and scope-aware assignment; request errors and empty/loading states. Ensure assignment/release/archive remain in-scope and validate duplicate identities. | `BeaconsPage.test.ts`, `tests/browser/beacons.spec.ts`; `BeaconAdminResource`, `BeaconIdentityUtil` |
| Products | Lists `/api/admin/products?size=1000`; local search/readiness filter/sort/paging; create/edit/delete; import review. Readiness uses layout code/store context; layout-code behavior has a documented `310/1/1/1` edge case. | Server-backed list/query, create/edit/delete, readiness and category context; catalog import parse/review/commit only where bulk APIs support it. Do not imply an atomic preview/commit that backend does not provide. | `ProductsPage.test.ts`, `CatalogImport.test.ts`, `tests/browser/products.spec.ts`; `AdminProductResource`, `docs/admin-rebuild/CATALOG_BULK.md` |
| Categories | Loads public category endpoint; create/edit drawer and import flow; list currently has no query/paging controls. | Admin category list/create/edit/import parse/review; supported writes and result reporting need to match protected legacy endpoints. | `tests/browser/categories.spec.ts`; `CategoriesPage.tsx`; category import behavior in `CatalogImport.test.ts` |
| Recipes | Search/status/sort; detail drawer; metadata including image URL/alt; tags; ingredients and steps; product selection/mapping; preview and publish/deactivate/archive. Existing edit fetches full detail and independently diffs ingredient/step writes; partial-stage failures are possible. | Server list filters/paging; fetches full detail, image fields, tags; edit scalars/tags and ingredient/step operations with stage errors/reload; mapping status/suggestions/confirm; preview and publication controls. Preserve image, tags, ingredients, steps across edits; regression fixture must prove no data loss. | `RecipesPage.test.ts`, `tests/browser/recipes.spec.ts`; `AdminRecipeResource`, `AdminRecipeTagResource`, `RecipeServiceTest` |
| Diagnostics | Admin-only audit and server error logs; refresh; inspect stack traces. Separate legacy page script checks `/api/admin/me` and redirects unauthorized/non-admin users. | Admin-only in-shell audit and error tables, empty/loading/error/retry/refresh. Scoped users must neither see logs nor invoke endpoints. | `tests/browser/diagnostics.spec.ts`; `AdminLogResource`, `ErrorLogResource` |
| Store layout editor | Separate DOM canvas editor. Toolbar: select/move/draw/edit/delete/validate/save draft/publish/preview/export/import. Supports store and global layouts via query context; legacy save semantics and store version semantics differ. | Store editor has assigned beacon context, element library/list, canvas/inspector, validation, undo/redo, unsaved warning, draft save, explicit publish, history and mobile current-layout preview. JSON import validates and enters undo history; export downloads without saving. Global editor remains separate and admin-only; global save is immediate publish. | `admin-ui/src/editor/fixtures/store-layout.json`, `fixture-compat.test.ts`, `editor.test.ts`, `contracts.test.ts`; browser `editor-route.spec.ts`, `editor.spec.ts`, `legacy-editor.spec.ts`; backend layout lifecycle/validation/lock tests |

### Shared page/request states

Legacy shared `request()` parses responses and redirects on 401; pages often use `safeGet` fallback values, which can turn fetch failure into an empty-looking list. Candidate `api/client.ts` distinguishes 401, 403, validation (400/422), conflict (409), server, network, invalid response and abort; it sends same-origin credentials, reads response body once, supports cancellation, and rejects cross-origin/non-`/api/` paths. Candidate shell shows bootstrap loading, session-expired/profile error, access-denied and unknown-route states. Page parity should explicitly check loading, empty, validation, conflict, 401/403, server/network failure, success confirmation and post-mutation authoritative reload; source-level coverage alone does not prove the rendered behavior in Quarkus.

## API/action surface (observed resource declarations)

| Resource family | Paths and methods used by staff UI | Access and scope |
| --- | --- | --- |
| Identity / audit / errors | `GET /api/admin/me`; `GET /api/admin/logs`; `GET /api/admin/error-logs` | Identity for the three staff roles; logs admin only |
| Regions | `GET /api/regions[?status=]`; `POST /api/regions`; `GET /api/regions/{regionId}`; `PUT /api/regions/{regionId}`; `PATCH /api/regions/{regionId}/archive` | Class permits three roles; writes explicitly admin-only; effective region/access checks in service |
| Stores | `GET /api/stores?query&regionId&status&hasActiveLayout&page&size`; `POST /api/stores`; `GET/PUT /api/stores/{storeId}`; `PATCH /api/stores/{storeId}/archive`; `GET /api/stores/{storeId}/audit`; `GET /api/stores/{storeId}/beacons` | Three roles; effective region/store scoping and mutation target checks |
| Store layouts | `GET /api/stores/{storeId}/layout/current`; `GET /versions`; `GET /versions/{layoutId}`; `POST /versions`; `POST /versions/{layoutId}/activate`; `GET /editor-context` | Three roles, each store access checked; public mobile current-layout remains a separate consumer contract |
| Beacons | `GET /api/beacons`; `GET /api/beacons/free`; `POST /api/beacons`; `POST /api/beacons/bulk`; `GET/PUT /api/beacons/{beaconId}`; `PATCH /archive`; `POST /assign`; `POST /release` | Three roles; visible-store filtering/scope enforced in service |
| Products | `GET /api/admin/products`; `POST /api/admin/products`; `DELETE /api/admin/products/{id}`; legacy catalog bulk path `/api/products/bulk` | Admin product resource admin-only; legacy write protection owned by `protect-legacy-write-endpoints`; verify every bulk operation's actual role gate before enabling candidate commit |
| Categories | legacy category read/write and `/api/categories/bulk` | Legacy write protection owner; inspect `protect-legacy-write-endpoints` route matrix and current runtime before treating candidate import as releasable |
| Recipes / tags | `/api/admin/recipes` GET/POST; `/{recipeId}` GET/PUT; publish/deactivate/archive PATCH; ingredient and step POST/PUT/DELETE; mapping-status/suggestions GET, product-mapping PUT, mapping DELETE; `/api/admin/recipe-tags` GET/POST/PUT/archive PATCH | Admin only |
| Global layout | `/api/layout/current`, `/api/layout/history` | Global legacy editing must remain admin-only; writes protected by legacy-write endpoint owner |

This is an endpoint-family inventory, not a replacement for reviewed OpenAPI. The change's task 5.1 owns reviewed schema updates for rebuild-owned HTTP changes. A typed route-to-request inventory should be refreshed against resource annotations and `openspec/specs/shared-api/openapi.yaml` before release.

## Fixtures, tests, and repeatable parity evidence

### Captured route references

The `legacy/` directory holds the ten current static-route captures from the 2026-10-12 local session; the four top-level captures show candidate routes. Reproduce candidate mock states with the linked browser specs; use [`LIVE_STACK.md`](LIVE_STACK.md) and `cd admin-ui && npm run test:live` for fresh runtime data. The live run creates a store and returns its ID; substitute that ID for `{storeId}` in detail/editor URLs. Screenshots are snapshots, not proof of the complete route inventory.

| Route / fixture | Static route capture | Candidate capture | Reproducible route or fixture |
| --- | --- | --- | --- |
| Dashboard | [dashboard](screenshots/legacy/dashboard.png) | [candidate dashboard](screenshots/dashboard.png) | `/admin/`; `/admin/next/`; `admin-ui/tests/browser/candidate.spec.ts` |
| Regions | [regions](screenshots/legacy/regions.png) | — | `/admin/regions/`; `/admin/next/regions/`; `admin-ui/tests/browser/regions.spec.ts` |
| Stores | [stores](evidence/stores/legacy-admin.png) | [candidate stores](evidence/stores/candidate-admin.png) | `/admin/stores/`; `/admin/next/stores/`; `admin-ui/scripts/live-stores-list-parity.mjs` |
| Store detail | [store detail](screenshots/legacy/store-detail.png) | — | `/admin/stores/detail/?storeId={storeId}` and `/admin/next/stores/detail/?storeId={storeId}`; `admin-ui/tests/browser/store-detail.spec.ts` |
| Beacons | [beacons](screenshots/legacy/beacons.png) | — | `/admin/beacons/`; `/admin/next/beacons/`; `admin-ui/tests/browser/beacons.spec.ts` |
| Products | [products](screenshots/legacy/products.png) | [candidate products](screenshots/products.png) | `/admin/products/`; `/admin/next/products/`; `admin-ui/tests/browser/products.spec.ts` |
| Categories | [categories](screenshots/legacy/categories.png) | — | `/admin/categories/`; `/admin/next/categories/`; `admin-ui/tests/browser/categories.spec.ts` |
| Recipes | [recipes](screenshots/legacy/recipes.png) | — | `/admin/recipes/`; `/admin/next/recipes/`; `admin-ui/tests/browser/recipes.spec.ts` |
| Diagnostics | [diagnostics](screenshots/legacy/diagnostics.png) | — | `/admin/server-logs/`; `/admin/next/server-logs/`; `admin-ui/tests/browser/diagnostics.spec.ts` |
| Store layout editor | [store editor](screenshots/legacy/editor.png) | [candidate store editor](screenshots/store-editor.png), [live selected shelf inspector](screenshots/store-editor-inspector.png) | `/admin/editor/?storeId={storeId}`; `/admin/next/editor/?storeId={storeId}`; `admin-ui/tests/browser/editor.spec.ts` |
| Global layout editor | [global editor](screenshots/legacy/global-editor.png) | [candidate global editor](screenshots/global-editor.png) | `/admin/editor/`; `/admin/next/editor/`; `admin-ui/tests/browser/legacy-editor.spec.ts` |

Candidate browser specs use mocked APIs. The local live acceptance adds authenticated refreshes and backend-backed workflows but does not exercise every listed action/state. Existing screenshots are retained unchanged.

| Evidence purpose | Present repository evidence | What it establishes / limit |
| --- | --- | --- |
| Candidate route/access | `admin-ui/src/routes.test.ts`; `tests/browser/candidate.spec.ts` | Role nav, route access and candidate page routing in mocks; not Quarkus/OIDC authorization |
| Browser workflows by page | `admin-ui/tests/browser/{regions,store-create,store-detail,beacons,products,categories,recipes,diagnostics,editor-route,editor,legacy-editor}.spec.ts` | Mocked browser interactions; record route/action/state assertions per old-to-new parity row |
| Unit/state/API | `admin-ui/src/{api/client,RegionsPage,StoresPage,BeaconsPage,ProductsPage,RecipesPage,CatalogImport}.test.ts` | Query, parsing, validation, client error handling and workflow logic; not production backend response semantics |
| Layout data compatibility | `admin-ui/src/editor/fixtures/store-layout.json`; editor contract/compat tests | Representative store layout fixture and shape compatibility; supplement with real legacy/global JSON, assigned/unassigned beacon and mobile response fixtures where absent |
| Backend role/resource/service | `backend/indooro_server/src/test/java/at/htl/resource/admin/*Test.java`; `AdminIndexResourceTest`; service tests including `StoreLayoutDraftLifecycleTest`, `StoreAdminServiceLockTest`, `StoreLayoutAdminServiceValidationTest`, `RecipeServiceTest` | Resource/service behavior; inspect role coverage per test and add direct-link/API role matrix evidence as needed |
| Old JS regression | `backend/indooro_server/src/test/js/admin-core.test.mjs`, `admin-editor-history.test.mjs`; `backend/indooro_server/src/test/playwright/admin-redesign.spec.mjs` | Existing static JS behavior and archived redesign tests; do not infer candidate production parity from archived/planning-only tests |
| Package/static link smoke | `admin-ui/scripts/verify-candidate.mjs`, `scripts/verify-admin-assets.mjs`, browser candidate tests | Static candidate files and nested links; OIDC / Quarkus packaged deep links still need live-stack proof |

Recommended route evidence row before cutover: legacy URL and candidate URL; old action and corresponding new action; API verb/path; each role's in-scope and out-of-scope fixture; query/deep-link reload; loading/empty/validation/conflict/401/403/error/success; keyboard/screen-reader check; post-action server state; rollback target. Useful disposable fixtures: admin, region manager and store manager assignments; second unrelated region/store to test isolation; a store with and without active and draft layouts; assigned, free, duplicate-identity, archived beacons; product values exercising missing/valid/ambiguous layout codes; recipe containing image URL/alt, multiple tags, existing ingredient and step ids, plus mapping states; audit/error records and empty responses. Store IDs and auth users should come from the local stack fixture setup rather than hard-coded production identifiers.

## Concrete parity gaps / acceptance follow-ups

1. Candidate remains under `/admin/next/`; nine current entries redirect there through the local route map. Editor retains its legacy entry while its full gate remains open. The packaged direct-link, refresh, action and rollback evidence for each enabled route is recorded in `ROUTE_PARITY_MATRIX.md` and `ROUTE_CUTOVER.md`.
2. Old list implementations use local filtering and paging (stores 25, products 30) over broad fetches; candidate stores/products/recipes use server query/page. Compare totals, filters and scope under >page-size fixtures.
3. Legacy `safeGet` fallback can mask fetch failures as empty data. Candidate per-page error states improve observability; verify all failed requests expose retry and preserve enough form state.
4. Recipe writes span metadata/tags and per-ingredient/per-step operations. The 2026-10-16 probe covers successful reads and representative failure/retry stages, including an ambiguous successful create response; no cross-request atomic transaction is evidenced by these resources. When a create result cannot be reconciled uniquely, the UI requires manual list inspection before retry.
5. Bulk product/category import must not report durable commit or transaction/preview guarantees absent from the protected endpoint behavior. Evidence is in `CATALOG_BULK.md`; carry unsupported cases as blocked UI/API gaps.
6. Legacy static navigation presents some actions to roles whose endpoint method is admin-only (notably region mutations); candidate should be checked against actual REST annotations, not copied affordance-for-affordance.
7. Layout editor parity is mode-sensitive: store draft save should not alter public mobile current layout; activation is separate; global layout save is immediate. Verify none/one/multiple version fixtures and anonymous mobile reads, plus history, import/export and tool behavior claimed by legacy UI.
8. Ensure forged cross-region/cross-store URLs and API mutations return backend 403/404 as appropriate; candidate-side `candidateAccess` is not sufficient evidence.

## Source pointers

- Route declaration/candidate guards: `admin-ui/src/routes.ts`, `admin-ui/src/main.tsx`, `admin-ui/scripts/candidate-paths.mjs`, `admin-ui/README.md`.
- Legacy route shell/actions/API map: `backend/indooro_server/src/main/resources/META-INF/resources/admin/app.js`, `core.js`, `editor/index.html`, `editor.js`, `server-logs/server-logs.js` and each nested `index.html`.
- Backend gates: `backend/indooro_server/src/main/java/at/htl/admin/service/AdminAccessService.java` and `backend/indooro_server/src/main/java/at/htl/resource/admin/` resources.
- Requirements and lifecycle: `openspec/changes/rebuild-admin-platform/design.md`, `tasks.md`, `specs/admin-platform-management/spec.md`, `specs/store-layout-management/spec.md`, and `specs/admin-dashboard/spec.md`.
