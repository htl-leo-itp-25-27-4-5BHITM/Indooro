# Admin rebuild API contract audit

**Scope:** OpenSpec `rebuild-admin-platform`, task 5.1; reviewed `openspec/specs/shared-api/openapi.yaml`; current Quarkus JAX-RS resources and the `admin-ui` API calls. Audited 2026-10-12.

## Result

All backend resource route/method pairs under `backend/indooro_server/src/main/java/at/htl/resource` have a matching OpenAPI path and operation. The rebuilt Admin UI calls are represented in the contract with an operation ID, access metadata, consumer metadata, applicable request/response schemas, and the documented status responses. The authenticated index mutation contract records admin-only access, create conflict behavior, and reported server failures for index mutations.

Updated the contract consumer metadata for routes the rebuilt UI uses but that were previously labeled only `api-tests` or `none`: category replacement, recipe tag listing, recipe ingredient and step create/update/delete, region detail, and free-beacon listing. Also refreshed the OpenAPI version and removed a stale implementation commit reference from its description.

## Checked operations

The following operation IDs are the current Admin UI contract surface (paths and methods included to make UI/API call-site checks reproducible):

### Catalog, legacy layout, session, and diagnostics

- `GET /api/products/search` — `searchProducts`
- `POST /api/products/bulk` — `indexProductsBulk` (legacy admin import client remains present)
- `GET /api/categories` — `listCategories`
- `POST /api/categories` — `upsertCategory`
- `PUT /api/categories/{categoryCode}` — `replaceCategory`
- `POST /api/categories/bulk` — `indexCategoriesBulk` (legacy admin import client remains present)
- `GET /api/layout/current` — `getLegacyCurrentLayout`
- `POST /api/layout/current` — `saveLegacyCurrentLayout`
- `GET /api/admin/me` — `getCurrentAdminUser`
- `GET /api/admin/logs` — `listAuditLogs`
- `GET /api/admin/error-logs` — `listErrorLogs`

### Products and recipes

- `GET /api/admin/products` — `listAdminProducts`
- `POST /api/admin/products` — `upsertAdminProduct`
- `DELETE /api/admin/products/{id}` — `deleteAdminProduct`
- `GET /api/admin/recipes` — `listAdminRecipes`
- `POST /api/admin/recipes` — `createRecipe`
- `GET /api/admin/recipes/{recipeId}` — `getAdminRecipe`
- `PUT /api/admin/recipes/{recipeId}` — `updateRecipe`
- `PATCH /api/admin/recipes/{recipeId}/publish` — `publishRecipe`
- `PATCH /api/admin/recipes/{recipeId}/deactivate` — `deactivateRecipe`
- `PATCH /api/admin/recipes/{recipeId}/archive` — `archiveRecipe`
- `POST /api/admin/recipes/{recipeId}/ingredients` — `addRecipeIngredient`
- `PUT /api/admin/recipes/{recipeId}/ingredients/{ingredientId}` — `updateRecipeIngredient`
- `DELETE /api/admin/recipes/{recipeId}/ingredients/{ingredientId}` — `deleteRecipeIngredient`
- `POST /api/admin/recipes/{recipeId}/steps` — `addRecipeStep`
- `PUT /api/admin/recipes/{recipeId}/steps/{stepId}` — `updateRecipeStep`
- `DELETE /api/admin/recipes/{recipeId}/steps/{stepId}` — `deleteRecipeStep`
- `GET /api/admin/recipes/{recipeId}/mapping-status` — `getAdminRecipeMappingStatus`
- `GET /api/admin/recipes/{recipeId}/ingredients/{ingredientId}/mapping-suggestions` — `getMappingSuggestions`
- `PUT /api/admin/recipes/{recipeId}/ingredients/{ingredientId}/product-mapping` — `confirmIngredientMapping`
- `DELETE /api/admin/recipes/{recipeId}/ingredients/{ingredientId}/product-mapping/{mappingId}` — `archiveIngredientMapping`
- `GET /api/admin/recipe-tags` — `listRecipeTags`

### Regions, stores, layouts, and beacons

- `GET /api/regions` — `listRegions`
- `POST /api/regions` — `createRegion`
- `GET /api/regions/{regionId}` — `getRegion`
- `PUT /api/regions/{regionId}` — `updateRegion`
- `PATCH /api/regions/{regionId}/archive` — `archiveRegion`
- `GET /api/stores` — `listStores`
- `POST /api/stores` — `createStore`
- `GET /api/stores/{storeId}` — `getStore`
- `PUT /api/stores/{storeId}` — `updateStore`
- `PATCH /api/stores/{storeId}/archive` — `archiveStore`
- `GET /api/stores/{storeId}/audit` — `getStoreAudit`
- `GET /api/stores/{storeId}/beacons` — `getStoreBeacons`
- `GET /api/stores/{storeId}/layout/current` — `getStoreCurrentLayout`
- `GET /api/stores/{storeId}/layout/versions` — `listStoreLayoutVersions`
- `POST /api/stores/{storeId}/layout/versions` — `saveStoreLayoutVersion`
- `GET /api/stores/{storeId}/layout/versions/{layoutId}` — `getStoreLayoutVersion`
- `POST /api/stores/{storeId}/layout/versions/{layoutId}/activate` — `activateStoreLayoutVersion`
- `GET /api/stores/{storeId}/layout/editor-context` — `getStoreEditorContext`
- `GET /api/beacons` — `listBeacons`
- `POST /api/beacons` — `createBeacon`
- `GET /api/beacons/free` — `listFreeBeacons`
- `POST /api/beacons/bulk` — `bulkCreateBeacons`
- `PUT /api/beacons/{beaconId}` — `updateBeacon`
- `PATCH /api/beacons/{beaconId}/archive` — `archiveBeacon`
- `POST /api/beacons/{beaconId}/assign` — `assignBeacon`
- `POST /api/beacons/{beaconId}/release` — `releaseBeacon`

Backend route inventory also confirmed reviewed operations for the other current endpoints (mobile stores/recipes/upsell, public catalog reads, PDF utility paths, and maintenance/index operations). No route/method omission was found.

## Auth, payload, and error checks

- Admin UI paths use the same-origin session client. Protected OpenAPI operations declare OIDC session and/or bearer security and an `x-indooro-access` class; scoped region/store checks remain service behavior.
- Admin index create/delete are `role:admin`, matching `@RolesAllowed("admin")` and `AdminAccessService.requireAdmin()`. The create conflict plus 401/403 and server-failure responses are represented; delete documents 401/403 and server failure. `GET /api/admin/health` is authenticated by the `/api/admin/*` HTTP permission and remains `authenticated`, matching its resource behavior.
- Rebuilt write calls have request schemas where they send payloads. Layout save documents the explicit `activate=false` draft behavior and legacy omitted/null behavior. Empty-object POSTs used for publication/assignment-style actions do not require a request schema where the backend ignores the body.
- Read and write responses use defined response schemas or reusable response components. Validation, conflict, not-found, and forbidden statuses are documented where applicable; admin API exception mappers return the shared JSON error shape for mapped exceptions.
- Public mobile current-layout remains anonymous, with the existing `MobileLayoutResponse` schema. Editor comparison reads that operation and does not alter the response.

## Residual gaps

- Explicit `example` values are not present for many existing admin request/response schemas. The schema shapes are defined and the admin client has fixture/browser coverage, but OpenAPI-level example coverage is not uniform.
- Guaranteed 401 response entries are not listed consistently on every secured operation. The security requirement expresses authentication, and the shared client handles 401 globally, but a consumer generating per-operation response types may not see that status for operations where it is omitted.
- The two catalog bulk endpoints retain `admin-ui` consumer labels for the legacy static client; the rebuilt import screens intentionally stop before commit because transaction/preview semantics are not guaranteed. `docs/admin-rebuild/CATALOG_BULK.md` tracks that limitation.

These are documentation completeness gaps rather than missing route definitions or newly discovered backend behavior; no speculative schemas or status behavior were added in this audit.
