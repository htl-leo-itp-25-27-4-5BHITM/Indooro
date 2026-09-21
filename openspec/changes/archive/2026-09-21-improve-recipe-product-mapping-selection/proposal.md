## Why

Recipe ingredient product mapping in the Admin Platform is too error-prone because admins can effectively confirm mappings from text-like product data instead of selecting a durable catalog product. This can produce mappings whose product id, product name, layout code, or store context do not match the real OpenSearch-backed product document, which weakens mobile recipe add-to-shopping-list and routing behavior.

This change is needed now because recipe shopping-list integration depends on stable product ids and trustworthy layout metadata. Admins need a searchable product selection workflow that stores mappings by real `productId` and lets the backend validate and snapshot product data from the catalog.

## What Changes

- Add a searchable Admin Recipe Mapping product combobox/autocomplete for each ingredient mapping row.
- Use existing product search/mapping suggestion data to show product id, name, price, layout code, store identity, and routability status.
- Confirm mappings by sending the selected `productId` plus optional store/mapping metadata, not arbitrary product name or layout code text.
- Change backend mapping confirmation so product data is loaded and validated server-side before persisting mapping snapshots.
- Reject unknown product ids with a clear `404` instead of saving a mapping from client-supplied text.
- Keep mappings for products without layout codes possible, but mark them as not routable in the Admin UI and preserve mobile `PRODUCT_WITHOUT_LAYOUT` behavior.
- Preserve mobile recipe mapping response compatibility: existing mobile DTO fields remain available and correctly populated from stored mappings/catalog products.
- Add focused backend, Admin JS, Playwright smoke, and httpYac coverage for product-id-backed recipe mapping.

## Capabilities

### New Capabilities
- `admin-recipe-product-mapping-selection`: Admin Recipe Mapping product selection, catalog-backed mapping confirmation, mapping-search UX states, and product-id-as-source-of-truth behavior.
- `recipe-catalog-shopping`: Recipe ingredient mapping source-of-truth requirements that extend the active recipe-shopping work until that capability is archived into the permanent spec set.

### Modified Capabilities
- `admin-platform-management`: The Admin Platform recipe workflow gains a protected product-selection control and must not save arbitrary product text as a mapping.
- `product-catalog-search`: Product search/mapping suggestions must expose enough product identity and location metadata for Admin mapping selection.

## Impact

- Backend:
  - `backend/indooro_server/src/main/java/at/htl/resource/admin/AdminRecipeResource.java`
  - `backend/indooro_server/src/main/java/at/htl/admin/service/RecipeService.java`
  - `backend/indooro_server/src/main/java/at/htl/admin/dto/RecipeDtos.java`
  - `backend/indooro_server/src/main/java/at/htl/service/OpenSearchService.java`
  - Existing product resources/search remain the catalog source.
- Admin UI:
  - `backend/indooro_server/src/main/resources/META-INF/resources/admin/app.js`
  - `backend/indooro_server/src/main/resources/META-INF/resources/admin/core.js`
  - `backend/indooro_server/src/main/resources/META-INF/resources/admin/styles.css`
- Tests:
  - `backend/indooro_server/src/test/java/at/htl/resource/admin/AdminRecipeResourceTest.java`
  - Recipe service tests or focused unit coverage where current test seams allow product validation behavior.
  - `backend/indooro_server/src/test/js/*.test.mjs`
  - `backend/indooro_server/src/test/playwright/admin-redesign.spec.mjs`
  - `api-tests/httpyac/05-recipes.http`
- No iOS/Swift changes are planned because the mobile DTO shape remains compatible.
