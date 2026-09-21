## 1. Contract Alignment

- [ ] 1.1 Add a contract check (`node --test`) that validates every mock payload in `scripts/serve-admin-smoke.mjs` against `openspec/specs/shared-api/openapi.yaml`.
- [ ] 1.2 Update the smoke mocks to `PageResponse.content`, `LayoutVersionSummary.status`, `stepCount`, and layout code `310/1/1/1`.

## 2. Backend

- [ ] 2.1 Change `RecipeService.assignTags` so that `null` keeps assignments and add `RecipeServiceTest` cases for `null`, `[]`, and replacement.
- [ ] 2.2 Add `stepCount` to `RecipeDtos.RecipeSummaryResponse` and the OpenAPI schema.
- [ ] 2.3 Add `page`, `size`, and `q` to `GET /api/admin/products` with a paged OpenSearch query returning `totalElements`.
- [ ] 2.4 Add the `hasActiveLayout` filter to `GET /api/stores` (EXISTS subquery on active layout versions).
- [ ] 2.5 Update `openspec/specs/shared-api/openapi.yaml` for 2.2–2.4.

## 3. Admin UI

- [ ] 3.1 Change the logout target to `/admin/logout`.
- [ ] 3.2 Load the recipe detail before editing; pre-fill image, description, tags, ingredients, and steps; send all fields and current `tagIds`.
- [ ] 3.3 Implement the ingredient/step diff with temporary positions and reload after saving.
- [ ] 3.4 Introduce per-route query state and server-side paging/search/filter for Stores, Rezepte, and Produkte; switch the recipe product picker to paged search.
- [ ] 3.5 Request categories with `size=500` and show a limit notice when 500 are returned.
- [ ] 3.6 Fix `readinessForProduct` to the documented format; change placeholders to `310/1/1/1`; send `null` for empty numeric fields.
- [ ] 3.7 Use `status === "ACTIVE"` for layout versions and `stepCount` in `recipeReadiness`.
- [ ] 3.8 Add `submitWithFeedback` and use it in all drawers and `confirmMutation`; add `data-error-summary` to region and store drawers.
- [ ] 3.9 Debounce filters, render only the table region, clear `actionRegistry` per render, and paginate client-side sections without re-fetching.
- [ ] 3.10 Add dialog roles, focus handling, Escape handling, associated filter labels; remove the non-functional store-detail tabs.
- [ ] 3.11 Bump the cache-busting version in all admin HTML entries.

## 4. Customer UI

- [ ] 4.1 Add `productLocation(product)` parsing `layoutCode`; use it in search results and highlighting; replace the alert with an inline hint.

## 5. Tests

- [ ] 5.1 Extend `admin-core.test.mjs` for readiness, payload builders (`null` numerics), and recipe diffing.
- [ ] 5.2 Extend Playwright: logout navigation, recipe edit preserves image/tags (mock verifies request body), paging to page 2, store form validation message, focus retention while typing, dialog keyboard handling.
- [ ] 5.3 Add a Quarkus test for `hasActiveLayout` and for admin product paging.

## 6. Verification

- [ ] 6.1 Run `npm run admin:verify` and `./mvnw test`.
- [ ] 6.2 On a local stack with the V7/V8 seed, edit „Apfel-Hafer-Crumble“ and confirm image and tags remain; confirm all 26 recipes are reachable; confirm logout requires a new login.
- [ ] 6.3 Run `npx -y @fission-ai/openspec@1.3.1 validate fix-admin-dashboard-contract-drift --strict`.
