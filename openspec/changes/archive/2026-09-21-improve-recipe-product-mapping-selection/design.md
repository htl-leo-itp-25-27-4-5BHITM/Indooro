## Context

The recipe Admin UI currently loads mapping status from `GET /api/admin/recipes/{recipeId}/mapping-status` and renders candidate buttons from each ingredient's `candidates`. When an admin clicks a candidate, `app.js` sends `productId`, `productName`, `layoutCode`, optional store fields, mapping type, confidence, and manual confirmation to `PUT /api/admin/recipes/{recipeId}/ingredients/{ingredientId}/product-mapping`.

Backend `RecipeService.confirmMapping` already stores `productId` and attempts to resolve the product through `OpenSearchService.getProductById(productId)`, but it does not reject an unknown product and still accepts client-supplied product snapshot fields. This means a bad UI payload or future caller can persist a mapping that is not anchored to a real catalog product.

The existing `GET /api/admin/recipes/{recipeId}/ingredients/{ingredientId}/mapping-suggestions` route already searches OpenSearch with ingredient context and returns `MappedRecipeProduct` with id, name, price, layout code, store id, and store code. It is the best fit for an admin combobox because it can default to the ingredient name/canonical name and optionally accepts `q`, `storeId`, and `size`.

## Goals / Non-Goals

**Goals:**
- Let admins search and choose a real catalog product for each recipe ingredient through a searchable combobox/autocomplete.
- Make `productId` the source of truth for recipe product mappings.
- Make backend mapping confirmation reject unknown product ids and snapshot name/layout/store data from the catalog, not from arbitrary request text.
- Keep store context optional and compatible with existing mapping status and mobile mapping responses.
- Show product id, name, price, layout code, store identity, and routability in the Admin UI.
- Add loading, empty, error, selected, clear/change, and save states for the mapping search control.
- Keep the mobile API DTO shape compatible.

**Non-Goals:**
- No iOS/Swift changes.
- No new product catalog database table or migration.
- No AI/automatic mapping acceptance beyond existing suggestions.
- No full keyboard-combobox ARIA framework beyond pragmatic keyboard/mouse support in the existing static Admin UI.
- No hardcoded product data.

## Decisions

1. Use the existing ingredient mapping suggestions route for Admin product search.
   - Decision: The combobox calls `GET /api/admin/recipes/{recipeId}/ingredients/{ingredientId}/mapping-suggestions?q=<term>&size=<limit>` and passes store context when available.
   - Rationale: This route is already protected, ingredient-aware, bounded, and returns the product fields needed by the UI.
   - Alternative considered: Use public `/api/products/search`. Rejected for the Admin mapping workflow because it lacks recipe ingredient context and would duplicate store/query fallback behavior.
   - Alternative considered: Add a new `/api/admin/products/search`. Deferred because there is no additional contract needed for this feature once mapping suggestions are made robust enough.

2. Confirm mapping with product identity, not product text.
   - Decision: `ProductMappingRequest` remains backward-compatible enough for now, but implementation and Admin UI treat only `productId`, optional `storeId/storeCode`, `mappingType`, `confidence`, and `manuallyConfirmed` as meaningful. `productName` and `layoutCode` are ignored for persistence.
   - Rationale: Removing fields immediately would be a breaking DTO/API change; ignoring them while documenting the new contract keeps old callers from poisoning snapshots.
   - Follow-up: A later cleanup can remove deprecated request fields after clients are known to be migrated.

3. Backend validates product existence and owns snapshot fields.
   - Decision: `RecipeService.confirmMapping` calls `OpenSearchService.getProductById(productId)` and rejects missing products with `404`.
   - Rationale: OpenSearch-backed product documents are the current product catalog source. Persisted mapping snapshots must reflect the catalog document, not UI text.
   - Product without layout code: allowed, with `layoutCodeSnapshot = null`; mapping status remains `PRODUCT_WITHOUT_LAYOUT` and Admin UI shows a non-routable warning.

4. Store context remains optional.
   - Decision: The Admin UI passes `storeId/storeCode` only when the selected product or mapping context provides them. The backend validates `storeId` if present and snapshots `storeCode` from the selected product when available, otherwise from the store entity/request fallback.
   - Rationale: Recipes are global by default today, but catalog documents may be store-aware. Optional scope avoids forcing a store selector into this MVP.

5. UI state stays local to the mapping drawer.
   - Decision: Each ingredient panel owns a lightweight combobox state keyed by ingredient id: query, debounce timer, loading/error/results, highlighted index, selected product.
   - Rationale: The Admin UI is a static JavaScript app without a component framework. A local state map keeps this scoped and avoids unrelated refactors.

## Risks / Trade-offs

- [Risk] OpenSearch may be unavailable during mapping confirmation. -> Mitigation: return a server error for true search failures and do not persist an unverified mapping.
- [Risk] Existing tests are mostly resource-level mocks, not full RecipeService integration. -> Mitigation: add resource assertions for payload shape and focused service tests if current test seams support mocking `OpenSearchService`.
- [Risk] Keyboard combobox behavior can become complex in static DOM code. -> Mitigation: implement practical ArrowUp/ArrowDown/Enter/Escape handling and mouse selection, with visible selection and clear/change controls.
- [Risk] Product ids may not be globally unique across future stores. -> Mitigation: preserve optional store id/store code in search, response, and mapping storage; future catalog changes can tighten uniqueness rules.
- [Risk] Keeping deprecated `productName/layoutCode` request fields may hide bad callers. -> Mitigation: backend ignores those fields for persistence and tests prove client-supplied text is not trusted.

## Migration Plan

- No database migration is required.
- Deploy backend and Admin UI together because the UI starts sending product-id-only mapping payloads and the backend starts rejecting unknown product ids.
- Rollback is code-only: revert the backend/Admin UI change. Existing persisted mappings remain valid because the table shape is unchanged.
- Existing mappings are not rewritten; future mapping status resolution still attempts to resolve current catalog product data and falls back to stored snapshots where appropriate.

## Open Questions

- Should a later change add a dedicated protected `/api/admin/products/search` route for all Admin product lookups?
- Should `productName` and `layoutCode` be removed from `ProductMappingRequest` after all callers are migrated?
