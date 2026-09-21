## 1. OpenSpec And Baseline

- [x] 1.1 Validate the new OpenSpec change with `openspec validate improve-recipe-product-mapping-selection --strict`.
- [x] 1.2 Review current recipe mapping backend, Admin UI, product search, and test seams before code changes.

## 2. Backend Mapping Contract

- [x] 2.1 Update `ProductMappingRequest` handling so recipe mapping confirmation persists only catalog-resolved product data.
- [x] 2.2 Make `RecipeService.confirmMapping` reject unknown `productId` with `404` and avoid saving client-supplied `productName` or `layoutCode`.
- [x] 2.3 Preserve optional store context and duplicate-active-mapping conflict behavior.
- [x] 2.4 Ensure products without layout code can be saved and still report `PRODUCT_WITHOUT_LAYOUT` in mapping status.

## 3. Admin Product Selection UI

- [x] 3.1 Replace static candidate-only recipe mapping UI with a searchable product combobox/autocomplete per ingredient.
- [x] 3.2 Add debounce, minimum query length, loading, empty, error, selected, clear/change, mouse selection, and practical keyboard handling.
- [x] 3.3 Display product id, name, price, layout code, store identity, and routability for each result.
- [x] 3.4 Submit only selected product identity and optional mapping/store metadata when confirming a mapping.
- [x] 3.5 Refresh mapping status after save and keep existing archive/confirmed mapping visibility intact.

## 4. Tests And API Checks

- [x] 4.1 Extend backend resource/service tests for mapping suggestions fields, product-id-only confirmation, unknown product rejection, duplicate conflict, and product-without-layout behavior.
- [x] 4.2 Extend Admin JS tests for combobox state/render helpers, payload construction, no arbitrary text submit, and routability display.
- [x] 4.3 Extend Admin Playwright smoke coverage to assert the recipe mapping search control is visible.
- [x] 4.4 Extend httpYac recipe checks for mapping suggestions, product-id confirmation, unknown product id, and mobile mapping reflection where fixtures allow.

## 5. Verification

- [x] 5.1 Run `openspec validate improve-recipe-product-mapping-selection --strict`.
- [x] 5.2 Run `openspec validate --all --strict`.
- [x] 5.3 Run backend tests from `backend/indooro_server`.
- [x] 5.4 Run `npm run admin:test`.
- [x] 5.5 Run `npm run admin:build`.
- [x] 5.6 Run `npm run admin:smoke` if the Playwright environment is available.
- [x] 5.7 Record any skipped verification with the reason.

Notes:
- `./mvnw test` could not run locally because `mvnw` is not executable; `mvn test` was used successfully instead.
- httpYac recipe mapping checks were not extended with a live confirm flow because the current `.env` only defines `ACTIVE_RECIPE_ID` and no stable active recipe ingredient fixture id for mapping confirmation.
