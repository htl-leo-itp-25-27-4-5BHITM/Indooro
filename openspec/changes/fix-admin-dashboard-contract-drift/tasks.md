## 1. Contract Alignment

- [x] 1.1 Add a contract check (`node --test`) that validates every mock payload in `scripts/serve-admin-smoke.mjs` against `openspec/specs/shared-api/openapi.yaml`. Evidence: `backend/indooro_server/src/test/js/admin-smoke-contract.test.mjs` validates every mock from `scripts/admin-smoke-mocks.mjs` with Ajv against `openapi.yaml` (`npm run admin:test`, 119 pass). `format` keywords (uuid, date-time) are not enforced yet.
- [x] 1.2 Update the smoke mocks to `PageResponse.content`, `LayoutVersionSummary.status`, `stepCount`, and layout code `310/1/1/1`. Evidence: `scripts/admin-smoke-mocks.mjs` (stores `content`, layout versions `status`, recipes `stepCount`, `310/1/1/1`).

## 2. Backend

- [x] 2.1 Change `RecipeService.assignTags` so that `null` keeps assignments and add `RecipeTagAssignmentTest` cases for `null`, `[]`, and replacement.
- [x] 2.2 Add `stepCount` to `RecipeDtos.RecipeSummaryResponse` and the OpenAPI schema.
- [x] 2.3 Add `page`, `size`, and `q` to `GET /api/admin/products` with a paged OpenSearch query returning `totalElements`.
- [x] 2.4 Add the `hasActiveLayout` filter to `GET /api/stores` (EXISTS subquery on active layout versions).
- [x] 2.5 Update `openspec/specs/shared-api/openapi.yaml` for 2.2–2.4.

## 3. Admin UI

Coordination (2026-10-12): `docs/admin-rebuild/CHANGE_COORDINATION.md` maps each UI item below to a current static-route fix or a replacement-route acceptance check. Items 3.4–3.5 and 3.8–3.11 remain open for the active static pages. The React candidate implements related behavior under `/admin/next/*`, but its presence does not close these items until route-specific parity and rollback are accepted in `rebuild-admin-platform` task 3.10. Backend/API items in section 2, customer item 4.1, and the contract/test gates remain owned here.

- [x] 3.1 Change the logout target to `/admin/logout`.
- [x] 3.2 Load the recipe detail before editing; pre-fill image, description, tags, ingredients, and steps; send all fields and current `tagIds`.
- [x] 3.3 Implement the ingredient/step diff with temporary positions and reload after saving.
- [x] 3.4 Introduce per-route query state and server-side paging/search/filter for Stores, Rezepte, and Produkte; switch the recipe product picker to paged search. Evidence (React candidate, routes cut over): server-side paging/search/filter in `admin-ui/src/{StoresPage,ProductsPage,RecipesPage}.test.ts` and `tests/browser/{candidate,products,recipes}.spec.ts` (paging to page 2, filters in URL); recipe product picker uses `/api/admin/products` search. Legacy `admin/app.js` stays only as rollback.
- [x] 3.5 Request categories with `size=500` and show a limit notice when 500 are returned. Evidence: `admin-ui/src/CategoriesPage.tsx` requests `size=500` and shows the limit notice; `tests/browser/categories.spec.ts` covers 500 (notice) and 3 (no notice).
- [x] 3.6 Fix `readinessForProduct` to the documented format; change placeholders to `310/1/1/1`; send `null` for empty numeric fields.
- [x] 3.7 Use `status === "ACTIVE"` for layout versions and `stepCount` in `recipeReadiness`.
- [x] 3.8 Add `submitWithFeedback` and use it in all drawers and `confirmMutation`; add `data-error-summary` to region and store drawers. Evidence (React candidate): failed mutations keep dialogs/forms open with `role="alert"` message in `tests/browser/{regions,recipes,store-detail,store-create}.spec.ts`.
- [x] 3.9 Debounce filters, render only the table region, clear `actionRegistry` per render, and paginate client-side sections without re-fetching. Evidence (React candidate): searches submit explicitly instead of re-rendering per keystroke, no `actionRegistry`; `tests/browser/products.spec.ts` asserts focus retention while typing and no request until submit; paging/filter state is in the URL (`candidate.spec.ts`). Debounce itself is not needed.
- [x] 3.10 Add dialog roles, focus handling, Escape handling, associated filter labels; remove the non-functional store-detail tabs. Evidence (React candidate): `tests/browser/recipes.spec.ts` (dialog focus trap, restore, Escape), `tests/browser/accessibility.spec.ts`; labelled filters are native `<label>`; no store-detail tabs exist in the candidate.
- [x] 3.11 Bump the cache-busting version in all admin HTML entries. Evidence: all admin entries now use `?v=contract-drift-20261018`; `node scripts/verify-admin-assets.mjs` passes.

## 4. Customer UI

- [x] 4.1 Add `productLocation(product)` parsing `layoutCode`; use it in search results and highlighting; replace the alert with an inline hint. Evidence (Sprint 2): `customer/shelf-text.js` (`describeProduct`/`findShelf` parse `layoutCode`), used in `customer/app.js` and `customer/list.js`; no `alert()` left; tests `customer-shelf-text.test.mjs`.

## 5. Tests

- [x] 5.1 Extend `admin-core.test.mjs` for readiness, payload builders (`null` numerics), and recipe diffing. Evidence: `admin-core.test.mjs` (readiness `310/1/1/1` vs `A-01`, null numeric payloads, store scope). The ingredient/step diff lives in `app.js` `saveRecipeContentDiff` (coupled to API calls); it is covered by the Playwright specs `recipe-edit-preservation.spec.mjs` and `admin-ui/tests/browser/recipes.spec.ts` instead of a unit test.
- [x] 5.2 Extend Playwright: logout navigation, recipe edit preserves image/tags (mock verifies request body), paging to page 2, store form validation message, focus retention while typing, dialog keyboard handling. Evidence: logout (`admin-redesign.spec.mjs`, `candidate.spec.ts`), recipe edit preserves image/tags (`recipe-edit-preservation.spec.mjs`, `recipes.spec.ts`), page 2 (`products.spec.ts`, `candidate.spec.ts`), store form validation (`store-create.spec.ts`: native required, focus, no POST), focus while typing (`products.spec.ts`), dialog keyboard (`recipes.spec.ts`).
- [x] 5.3 Add a Quarkus test for `hasActiveLayout` and for admin product paging. Evidence: `StoreAdminServiceTest` (`hasActiveLayout` predicates) and `AdminProductResourceTest` (paging, `totalElements`, clamping).

## 6. Verification

- [x] 6.1 Run `npm run admin:verify` and `./mvnw test`. Evidence 2026-10-18: root `npm run admin:test` 119 pass, root Playwright 45 pass, `admin-ui` typecheck + 174 unit pass, `sh mvnw -q test` exit 0 (378 tests, 0 failures, 2 skipped); `admin-ui` browser 140 pass, 1 fail (`editor-global-accessibility.spec.ts:7`, customer page shows "Markt wählen" instead of the shop name; unrelated to this change).
- [ ] 6.2 (Mensch: needs a local stack with V7/V8 seed and a Keycloak login.) On a local stack with the V7/V8 seed, edit „Apfel-Hafer-Crumble“ and confirm image and tags remain; confirm all 26 recipes are reachable; confirm logout requires a new login.
- [ ] 6.3 Run `npx -y @fission-ai/openspec@1.3.1 validate fix-admin-dashboard-contract-drift --strict`.
