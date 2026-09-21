## Why

The audit (`docs/audit/CODE_AUDIT.md`, chapters 3.2, 3.3, 4.2, and 5) found that the Admin UI and the customer page disagree with the backend contract in ways that break daily work:

- API-11: the logout button navigates to `/logout`, but Quarkus OIDC logs out at `/admin/logout`; the session stays active.
- BUG-13/BUG-14: editing a recipe from the list sends `description`, `imageUrl`, and `imageAlt` as missing and `tagIds: []`, so every edit deletes description, image, and all tags; ingredient and step edits in the drawer are silently discarded.
- API-12/API-15/API-18: lists fetch only the first server page (20 stores, 20 recipes) or silently truncate products and categories, and filters run after pagination; six of the 26 seeded recipes are invisible.
- API-16/BUG-15: product readiness rejects every valid `310/1/1/1` layout code and the product form suggests `A-01`; an empty major in the beacon bulk form becomes 0.
- API-17/API-19: active layout versions never show as active; missing steps are never warned.
- BUG-05/BUG-16: failed mutations leave dialogs open without feedback; region and store forms block silently on validation errors.
- PERF-20…22: each keystroke re-renders the whole page, loses input focus, leaks action closures, and page changes re-fetch data.
- API-22: smoke-test mocks use a different contract and hide these defects.
- API-23: the customer page reads `categoryCode` and `layout.meter`, which products do not have, so product highlighting always fails.

## What Changes

- Use `/admin/logout` for logout.
- Load the full recipe before editing, send every field, keep tags unless the request explicitly changes them, and persist ingredient and step edits through the item endpoints.
- Use server-side paging, search, and filters for stores and recipes; add server-side paging and search to the admin product list; request categories within the backend limit and show a limit notice.
- Accept the documented layout-code format in readiness checks and examples; send `null` for empty numeric fields.
- Map layout version `status` and warn about recipes without steps using a new `stepCount` field.
- Handle mutation errors uniformly with a toast, keep drawers open with the message, and prevent double submission; show validation messages in all drawers.
- Debounce filter input, re-render only the table region, reset the action registry per render, and paginate without re-fetching.
- Align smoke-test mocks with `openspec/specs/shared-api/openapi.yaml`.
- Derive category code and meter from `layoutCode` on the customer page.
- Make dialogs and drawers accessible (role, label, focus handling) and remove non-functional tabs.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `admin-dashboard`: logout target, lossless recipe editing, server-side list paging, layout-code readiness, version status display, mutation error handling, input performance, accessible dialogs, contract-aligned smoke tests.
- `backend-core`: recipe tag assignments are kept when `tagIds` is omitted; recipe summaries include `stepCount`; admin products support paging and search.
- `customer-web-experience`: product location is derived from `layoutCode`.

## Impact

- Admin UI: `admin/app.js`, `admin/core.js`, `admin/index.html` and page entries (cache-busting version), `backend/indooro_server/src/test/js/admin-core.test.mjs`, `backend/indooro_server/src/test/playwright/admin-redesign.spec.mjs`, `scripts/serve-admin-smoke.mjs`.
- Customer UI: `customer/app.js`.
- Backend: `RecipeService.assignTags`, `RecipeDtos.RecipeSummaryResponse`, `AdminProductResource`, `OpenSearchService` (paged search with total), `openspec/specs/shared-api/openapi.yaml`.
- Auth: logout now reaches the configured OIDC logout path; no route classification changes. Protected: `/admin/*`, `/api/admin/*`, `/api/regions*`, `/api/stores*`, `/api/beacons*`. Public: unchanged. Roles: unchanged.
- Demo proof: logout followed by opening `/admin/` shows the Keycloak login; editing the seeded recipe „Apfel-Hafer-Crumble“ keeps its image and tags; all 26 seeded recipes are reachable in the list; product `310/1/1/1` shows „Routbar“.
