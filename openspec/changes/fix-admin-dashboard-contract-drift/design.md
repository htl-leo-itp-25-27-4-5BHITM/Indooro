## Context

The Admin UI is a build-free ES-module application (`admin-dashboard`). Its list pages call `/api/stores` and `/api/admin/recipes` without paging parameters and then paginate and filter the first page in the browser (`app.js:197-236`, `420-460`). The recipe drawer is opened with the list summary (`app.js:446`), which lacks `description`, `imageAlt`, ingredients, and steps; on save it sends `tagIds: []` and no image fields (`app.js:775-795`). `RecipeService.applyRecipeRequest` copies all fields, and `assignTags` clears tag assignments before checking for `null` (`RecipeService.java:428-430`, `488-493`). Logout navigates to `/logout` (`app.js:93`) while `quarkus.oidc.logout.path=/admin/logout`.

## Goals / Non-Goals

**Goals:** fix every admin and customer contract defect listed in the proposal with minimal structural change to the static UI.

**Non-Goals:** migrating the Admin UI to a framework or TypeScript (blueprint phase 3); server-side paging for beacons (the list stays small and is optimized in `optimize-backend-data-access`); XSS fixes (in `harden-platform-security-baseline`).

## Decisions

1. **Recipe update semantics.** `PUT /api/admin/recipes/{id}` stays a full replacement of scalar fields, but `tagIds: null` now means „keep assignments“ and `[]` means „remove all“. The UI always loads `GET /api/admin/recipes/{id}` before editing and sends every scalar field plus the current `tagIds`. Alternative: `PATCH` with JSON Merge Patch. Rejected for now to avoid a second update path; revisit in `establish-shared-api-contract`.
2. **Ingredient and step edits.** The edit drawer diffs the loaded detail with the drawer state and calls the existing item endpoints (`POST/PUT/DELETE …/ingredients`, `…/steps`) sequentially, stopping at the first error and reloading the detail afterwards. Position conflicts are avoided by first moving changed items to temporary high positions (`position + 1000`) and then to the final positions.
3. **Server-side lists.** The UI keeps a query state `{page, size, query, filters, sort}` per route and passes it to the backend: stores use `query`, `regionId`, `status`, `page`, `size`; recipes use `q`, `tag`, `status`, `page`, `size`. The layout filter („Aktiv/Fehlt“) is added to the store list endpoint as `hasActiveLayout` (boolean). Sorting stays client-side within the returned page and is labelled accordingly.
4. **Admin product paging.** `GET /api/admin/products` accepts `page`, `size` (max 100), and `q`; when `page` is present the response is a `PageResponse<Product>` with `totalElements` from OpenSearch `hits.total`. Without `page` the legacy array response remains for one release for the recipe product picker, which is switched to the paged search in the same change.
5. **Layout-code readiness.** Readiness accepts codes matching `^\d{1,4}/\d{1,3}/\d{1,2}/\d{1,2}$` as routable and flags other non-empty codes as „Layout-Code ist unklar“. Mocks and examples use `310/1/1/1`.
6. **Rendering performance.** `hydrateFilters` debounces input by 250 ms and re-renders only `[data-table-region]`, preserving focus. `actionRegistry` is cleared at the start of each page render. Paging uses the stored page data for client-side sections and the server for server-side lists.
7. **Error handling.** A shared `submitWithFeedback(button, fn)` disables the button during the request, shows a danger toast and an inline message on failure, and closes the drawer only on success. `confirmMutation` uses the same helper.
8. **Accessibility.** Drawers and dialogs get `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, initial focus, focus return on close, and `Escape` to close. Filter labels get `for` attributes. The non-functional store-detail tabs are removed.
9. **Customer page.** `productLocation(product)` parses `layoutCode` into `categoryCode` and `meter`; search results and highlighting use it.

## Risks / Trade-offs

- [Sequential item updates are not atomic] → the detail is reloaded after the batch and the UI shows which items failed; an atomic bulk endpoint is noted as future work.
- [Changing the admin product response shape] → only the Admin UI and API tests consume it; both are updated in the same change.

## Migration Plan

Deploy backend and static assets together (same image). Bump the cache-busting query version in all admin HTML entries. Rollback by redeploying the previous image.
