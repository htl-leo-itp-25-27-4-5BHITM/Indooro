## 1. Analysis and Setup

- [x] 1.1 Verify the implementation target is `swift/indooro-EinkaeuferFinal/indooroApp` and not the legacy Swift app trees.
- [x] 1.2 Verify whether new Swift files are automatically included in `MCindooroApp` or require `project.pbxproj` updates.
- [x] 1.3 Confirm the `MCindooroApp` scheme can be built with `xcodebuild`.
- [x] 1.4 Re-check current product DTO fields and store-scoped search behavior before implementing mapping resolution.
- [x] 1.5 Re-check current backend test profile and decide how recipe API tests will run with PostgreSQL/Flyway.

## 2. Database and Backend Domain

- [x] 2.1 Add Flyway migration for `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_tags`, `recipe_tag_assignments`, `ingredient_product_mappings`, `ingredient_synonyms`, and `units`.
- [x] 2.2 Add constraints, foreign keys, cascade behavior, status checks, unique indexes, and query indexes from the design.
- [x] 2.3 Add recipe, ingredient, step, tag, mapping, synonym, and unit JPA/Panache entities.
- [x] 2.4 Add repositories for recipe aggregate queries, tag lookup, and active mapping lookup.
- [x] 2.5 Add service methods for recipe CRUD, publish/deactivate/archive, ingredient/step ordering, and tag assignment.
- [x] 2.6 Add service methods for mapping status, product verification, store-aware mapping preference, and mapping suggestions.
- [x] 2.7 Add audit log calls for recipe publish/deactivate/archive and mapping changes where consistent with existing admin patterns.

## 3. Backend DTOs and Public Mobile APIs

- [x] 3.1 Add mobile recipe summary, detail, ingredient, step, tag, mapping status, and mapped product DTOs.
- [x] 3.2 Implement `GET /api/mobile/recipes` with published-only pagination and optional filters.
- [x] 3.3 Implement `GET /api/mobile/recipes/search?q=...` with required query validation and bounded pagination.
- [x] 3.4 Implement `GET /api/mobile/recipes/{recipeId}` with published-only detail access.
- [x] 3.5 Implement `GET /api/mobile/recipes/{recipeId}/product-mapping?storeId=...&storeCode=...`.
- [x] 3.6 Ensure mobile recipe routes are anonymous and do not require Admin Platform login.
- [x] 3.7 Ensure draft and archived recipes are hidden from all mobile recipe routes.

## 4. Protected Admin APIs

- [x] 4.1 Add admin recipe list/detail/create/update endpoints under `/api/admin/recipes`.
- [x] 4.2 Add admin publish, deactivate, and archive endpoints with validation.
- [x] 4.3 Add admin ingredient create/update/delete/reorder endpoints.
- [x] 4.4 Add admin step create/update/delete/reorder endpoints.
- [x] 4.5 Add admin recipe tag list/create/update/archive endpoints.
- [x] 4.6 Add admin mapping-status and mapping-suggestion endpoints.
- [x] 4.7 Add admin mapping confirm/update/archive endpoints.
- [x] 4.8 Protect all admin recipe endpoints with admin role checks and existing access-assignment validation.
- [x] 4.9 Return clear `400`, `403`, `404`, and `409` errors for validation, authorization, missing records, and conflicts.

## 5. Admin Platform UI

- [x] 5.1 Add recipe navigation and dashboard entry to the Admin Platform for admin users only.
- [x] 5.2 Add recipe list with filters for status, query, tag, page, and size.
- [x] 5.3 Add recipe metadata form for title, summary, description, portions, times, tags, image URL, and status.
- [x] 5.4 Add ordered ingredient editor with quantity, unit, optional flag, canonical name, and preparation note.
- [x] 5.5 Add ordered step editor with instruction text and optional duration.
- [x] 5.6 Add mapping preview showing mapped, unmapped, multiple candidates, unavailable, and no-layout states.
- [x] 5.7 Add product suggestion and manual mapping confirmation workflow.
- [x] 5.8 Add publish/deactivate/archive controls and validation feedback.
- [x] 5.9 Verify non-admin roles do not see recipe mutation controls in the MVP.

## 6. iOS Recipe Models and Store

- [x] 6.1 Add Swift recipe summary/detail/ingredient/step/tag/mapping Codable models.
- [x] 6.2 Add a `RecipeStore` or equivalent manager for list, search, detail, mapping, loading, empty, and error state.
- [x] 6.3 Keep recipe API calls scoped to the modern shopper app and aligned with the current API base.
- [x] 6.4 Decode optional image and mapping fields without failing the whole recipe screen.
- [x] 6.5 Add store-context mapping calls using the selected or detected `MobileStoreSummary` when available.

## 7. iOS Recipe UI

- [x] 7.1 Add `RecipesPage` or an equivalent recipe section in the modern app navigation.
- [x] 7.2 Add `RecipeListView`, `RecipeSearchView`, and `RecipeCard`.
- [x] 7.3 Add `RecipeDetailView` with ingredients, steps, tags, portions, and time metadata.
- [x] 7.4 Add loading, error, empty, and retry states for recipe list/search/detail.
- [x] 7.5 Add `RecipeIngredientList` and `IngredientMappingStatusView`.
- [x] 7.6 Add recipe entry point to `HomeDashboardView` or the Planung flow.
- [x] 7.7 Verify recipe screens support Dynamic Type and VoiceOver labels for mapping/add actions.

## 8. iOS Shopping-List Integration

- [x] 8.1 Extend `ShoppingListItem` with optional recipe source metadata.
- [x] 8.2 Add backward-compatible decoding for existing locally persisted shopping lists.
- [x] 8.3 Add support for local free/unmapped ingredient entries with no product id and no layout code.
- [x] 8.4 Update route snapshot resolution so free entries remain unresolved and cannot create route stops.
- [x] 8.5 Add a batch recipe-add method to `ShoppingListManager` that reuses existing product merge behavior.
- [x] 8.6 Implement duplicate handling for mapped products, completed products, and free ingredient entries.
- [x] 8.7 Add `AddRecipeToShoppingListSheet` with mapped/unmapped review and selected-list confirmation.
- [x] 8.8 Refresh the active shopping session after recipe items are added to the active list.
- [x] 8.9 Update list rows to show recipe source or ingredient quantity where useful without cluttering normal product rows.
- [x] 8.10 Review shopping-list transfer import/export compatibility and bump transfer version if free entries are exported.

## 9. Tests

- [x] 9.1 Add backend tests for mobile recipe list/search/detail and published-only behavior.
- [x] 9.2 Add backend tests for mobile mapping statuses including mapped, unmapped, multiple candidates, unavailable, and no-layout.
- [x] 9.3 Add backend tests for admin recipe CRUD validation and protected-route behavior.
- [x] 9.4 Add backend tests for publish/deactivate/archive lifecycle.
- [x] 9.5 Add backend tests for mapping suggestion and manual mapping confirmation conflict handling.
- [x] 9.6 Add Swift decoding or manager tests if an iOS test target is available.
- [x] 9.7 Manually test recipe add flow with duplicate product, free ingredient, no-layout product, and active shopping session scenarios. (Vom Team am 2026-09-21 als manuell bestanden bestätigt.)

## 10. Verification and Polish

- [x] 10.1 Run `openspec status --change add-recipe-shopping-list-integration`.
- [x] 10.2 Run `openspec validate --all --strict` or the workspace-pinned `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [x] 10.3 Run backend tests with `./mvnw test` from `backend/indooro_server`.
- [x] 10.4 Build the iOS app with `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp build`.
- [x] 10.5 Smoke test existing product search, store detection, current layout loading, and shopping-tour routing. (Vom Team am 2026-09-21 als manuell bestanden bestätigt.)
- [x] 10.6 Smoke test Admin Platform product, store, beacon, and layout workflows still behave as before. (Vom Team am 2026-09-21 als manuell bestanden bestätigt.)
- [x] 10.7 Update OpenSpec artifacts if implementation discovers a necessary contract change.
