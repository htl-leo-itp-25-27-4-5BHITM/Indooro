## Context

This change targets only the modern shopper app at `swift/indooro-EinkaeuferFinal/indooroApp`, the Xcode project `swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj`, and the `MCindooroApp` scheme. The older `swift/indooroApp/indooroApp` tree is out of scope, and `swift/indooro-/indooroApp` is reference-only.

Relevant current state from analysis:

- iOS `Product` is a small `Codable` model with `id: Int`, `name`, `price`, and `layoutCode`.
- `ProductSearchStore` and `BeaconManager` call the public product API under `https://it220209.cloud.htl-leonding.ac.at/api/products/search`.
- `ShoppingListManager` persists local lists in `UserDefaults`, merges duplicate open products by `productID + layoutCode`, and has no backend customer identity.
- `ShoppingStopResolver` routes only list items whose `layoutCode` resolves to layout shelf elements; unresolved items are already supported.
- `ContentView` owns shared managers and has tabs for Start, Planung, Einkaufen, and Karte.
- `ProductsPage`, `ShoppingListsPage`, `HomeDashboardView`, `StoreMapPage`, and `ProductSearchRow` are the natural SwiftUI integration points.
- Backend products are OpenSearch documents, not PostgreSQL product rows. Product documents include `id`, `name`, `price`, `layoutCode`, optional `storeId`, and optional `storeCode`.
- Backend operational data uses Quarkus, Hibernate ORM Panache, PostgreSQL, Flyway, DTO records, service/resource separation, and protected admin resources.
- Admin UI is static HTML/CSS/JS served from `backend/indooro_server/src/main/resources/META-INF/resources/admin`.
- Current backend tests are only the generated Quarkus hello tests, so recipe work must add real resource/service tests.

Assumptions:

- Recipes are curated operational content, not user-generated content.
- Anonymous mobile users can read published recipes, but only admin users can mutate recipes in the MVP.
- Product availability is approximated through current catalog search/product lookup and store-scoped product fields; there is no live inventory system.
- Product mappings reference OpenSearch product ids and snapshot useful display fields, but OpenSearch remains the product source of truth.
- Free shopping-list entries are acceptable for unmapped recipe ingredients as local-only, unroutable list items.
- Recipe image handling starts with image URL and alt text; binary upload can be added later.
- The first implementation can seed a small demo recipe dataset for validation, but production import tooling is future scope.

Files and areas that still need implementation-time verification:

- Whether `MCindooroApp.xcscheme` is available as a shared or user scheme on the build machine before running `xcodebuild -scheme MCindooroApp`.
- Whether the Swift project uses synchronized folder references enough that new Swift files are automatically included in the target, or whether `project.pbxproj` needs explicit file references.
- Whether the app should keep four tabs and nest recipes under Planung, or add a fifth `Rezepte` tab after UX review.
- Whether existing shopping-list transfer packages need a version bump if free/unmapped entries become exportable.

## Goals / Non-Goals

**Goals:**

- Add a backend recipe catalog with recipes, ingredients, steps, tags, optional units, optional synonyms, and ingredient/product mappings.
- Expose anonymous mobile recipe list, search, detail, and mapping-status APIs.
- Add protected admin APIs and Admin Platform UI for recipe CRUD, tags, ingredient/step maintenance, mapping review, suggestions, and publish/deactivate.
- Integrate recipes into `swift/indooro-EinkaeuferFinal/indooroApp` with list, search, detail, mapping status, and add-to-shopping-list flows.
- Reuse `ShoppingListManager`, product model semantics, and existing shopping-session routing for mapped products.
- Preserve unmapped ingredients visibly as free/unmapped local entries or as skipped/not-added summary items.
- Keep existing beacon detection, store selection, layout loading, product search, and route behavior compatible.

**Non-Goals:**

- Backend-synchronized customer shopping lists or customer accounts.
- Server-side customer tracking, analytics, or recipe personalization.
- AI recipe generation or AI mapping auto-publish.
- Nutrition, allergens, ratings, reviews, meal planning calendars, or dietary profiles.
- Full unit/package optimization such as computing exact package counts across recipes.
- Live inventory, ERP/POS integration, or guaranteed store stock.
- Android support.
- Binary image upload in MVP unless explicitly added after URL-based images.

## Decisions

### 1. Store recipe content in PostgreSQL

Recipes are operational content, so they belong in PostgreSQL with the existing admin domain model rather than in OpenSearch. OpenSearch remains the product search source. If recipe full-text search later needs better ranking, recipes can be indexed into OpenSearch as a derived read model.

Alternative considered: store recipes in OpenSearch only. Rejected because admin CRUD, child ingredient/step ordering, publish lifecycle, constraints, and auditability fit PostgreSQL better.

### 2. Keep mobile recipe APIs anonymous and read-only

Mobile recipes follow the same anonymous customer boundary as mobile stores and product search. Admin mutation routes stay protected under `/api/admin/recipes`.

Auth boundary:

- Public: `GET /api/mobile/recipes`, `GET /api/mobile/recipes/search`, `GET /api/mobile/recipes/{recipeId}`, `GET /api/mobile/recipes/{recipeId}/product-mapping`.
- Protected MVP: `/api/admin/recipes/**`, `/api/admin/recipe-tags/**`, mapping suggestion/mutation routes.
- MVP permissions: `@RolesAllowed("admin")` plus `AdminAccessService.requireAdmin()`.

Alternative considered: require login for mobile recipes. Rejected because the existing shopper app is anonymous and recipes do not require customer identity.

### 3. Do not add backend add-to-shopping-list in MVP

The iOS shopping list is local mobile state. A backend route such as `POST /api/mobile/recipes/{recipeId}/add-to-shopping-list` would imply a customer identity, list id, sync rules, privacy behavior, and conflict handling that the current project explicitly treats as future scope.

The iOS app should call recipe detail/mapping endpoints, then convert selected ingredients locally through `ShoppingListManager`.

Alternative considered: backend returns a ready-made shopping list mutation. Rejected because there is no backend list persistence.

### 4. Make product mappings explicit and conservative

MVP mapping behavior:

- Exact product mapping: active mapping points to one product id and can be auto-added by the app.
- Category mapping: used as an admin suggestion hint, not as an auto-add mapping in MVP.
- Synonym mapping: used to improve suggestions, not to silently choose a product.
- Multiple candidates: surfaced to admin and optionally mobile, but not auto-selected.
- Store-specific availability: prefer mapping for selected/detected store; fall back to global only if the product resolves under the current store context or is explicitly global.
- Product without layout: addable as a product, but marked unresolved for navigation.
- Conflict examples like milk variants require manual confirmation to one product or explicit candidate choice.

Alternative considered: let the mobile app search products for every ingredient and auto-pick top results. Rejected because fuzzy product search can return unsafe matches, especially for variants, sizes, and colloquial terms.

### 5. Database schema

Use a Flyway migration such as `V7__recipe_catalog.sql`. Entities should extend or mirror `AuditableEntity` conventions with UUID primary keys and `created_at`/`updated_at`.

Core tables:

| Table | Key fields | Constraints and indexes |
| --- | --- | --- |
| `recipes` | `id UUID PK`, `slug VARCHAR(140)`, `title VARCHAR(180)`, `summary TEXT`, `description TEXT`, `image_url TEXT`, `image_alt VARCHAR(240)`, `servings INTEGER`, `prep_time_minutes INTEGER`, `cook_time_minutes INTEGER`, `total_time_minutes INTEGER`, `status VARCHAR(20)`, `published_at TIMESTAMPTZ`, `archived_at TIMESTAMPTZ`, `created_by_role VARCHAR(40)`, `created_by_label VARCHAR(120)`, `created_at`, `updated_at` | `slug UNIQUE`, status check `DRAFT/PUBLISHED/ARCHIVED`, positive servings, non-negative times, indexes on `status`, `title`, `published_at DESC` |
| `recipe_ingredients` | `id UUID PK`, `recipe_id UUID FK`, `position INTEGER`, `display_name VARCHAR(180)`, `canonical_name VARCHAR(180)`, `quantity NUMERIC(12,3)`, `quantity_text VARCHAR(80)`, `unit_code VARCHAR(20) FK`, `preparation_note TEXT`, `is_optional BOOLEAN`, `created_at`, `updated_at` | `recipe_id REFERENCES recipes(id) ON DELETE CASCADE`, `unit_code REFERENCES units(code) ON DELETE SET NULL`, `UNIQUE(recipe_id, position)`, index on `recipe_id`, index on `canonical_name` |
| `recipe_steps` | `id UUID PK`, `recipe_id UUID FK`, `position INTEGER`, `instruction TEXT`, `duration_minutes INTEGER`, `created_at`, `updated_at` | `recipe_id REFERENCES recipes(id) ON DELETE CASCADE`, `UNIQUE(recipe_id, position)`, non-empty instruction |
| `recipe_tags` | `id UUID PK`, `code VARCHAR(80)`, `name VARCHAR(120)`, `kind VARCHAR(40)`, `status VARCHAR(20)`, `created_at`, `updated_at` | `code UNIQUE`, status check `ACTIVE/ARCHIVED`, index on `status` |
| `recipe_tag_assignments` | `recipe_id UUID`, `tag_id UUID` | composite PK or unique `(recipe_id, tag_id)`, both FKs `ON DELETE CASCADE` |
| `ingredient_product_mappings` | `id UUID PK`, `recipe_ingredient_id UUID NULL`, `canonical_name VARCHAR(180)`, `store_id UUID NULL`, `store_code VARCHAR(50) NULL`, `product_id INTEGER`, `product_name_snapshot VARCHAR(240)`, `layout_code_snapshot VARCHAR(80)`, `mapping_type VARCHAR(30)`, `confidence NUMERIC(4,3)`, `manually_confirmed BOOLEAN`, `status VARCHAR(20)`, `created_at`, `updated_at` | FK to ingredient `ON DELETE CASCADE`, FK `store_id REFERENCES stores(id) ON DELETE SET NULL`, status check `ACTIVE/ARCHIVED`, mapping type check `EXACT/CATEGORY/SYNONYM/MANUAL`, indexes on ingredient/status, canonical/status, store/status, product id |
| `ingredient_synonyms` | `id UUID PK`, `canonical_name VARCHAR(180)`, `synonym VARCHAR(180)`, `locale VARCHAR(12)`, `status VARCHAR(20)`, `created_at`, `updated_at` | `UNIQUE(locale, synonym)`, index on `canonical_name`, status check |
| `units` | `code VARCHAR(20) PK`, `display_name VARCHAR(60)`, `unit_kind VARCHAR(20)`, `gram_factor NUMERIC(12,6) NULL`, `milliliter_factor NUMERIC(12,6) NULL`, `status VARCHAR(20)` | code unique by PK, status check |

Unique active mapping rules should prevent duplicate active mappings for the same recipe ingredient, store, and product. A partial unique index can enforce this for active rows:

```sql
CREATE UNIQUE INDEX uk_active_recipe_ingredient_product_mapping
ON ingredient_product_mappings(recipe_ingredient_id, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid), product_id)
WHERE status = 'ACTIVE' AND recipe_ingredient_id IS NOT NULL;
```

If canonical/global mappings are implemented, add a separate partial unique index for `canonical_name + store + product`.

### 6. Backend API design

Use DTO records near existing `at.htl.admin.dto` patterns, likely `RecipeDtos.java` and `MobileRecipeDtos.java`, plus services under `at.htl.admin.service` and resources under `at.htl.resource.mobile` and `at.htl.resource.admin`.

Mobile routes:

| Route | Request | Response | Errors | Auth and pagination |
| --- | --- | --- | --- | --- |
| `GET /api/mobile/recipes` | Query `page` default 0, `size` default 20 max 50, optional `tag`, optional `storeId` for summary mapping counts | `CommonDtos.PageResponse<MobileRecipeSummary>` with id, title, summary, servings, totalTimeMinutes, imageUrl, tags, mappedIngredientCount, totalIngredientCount | `400` invalid page/size/storeId | Anonymous, published recipes only |
| `GET /api/mobile/recipes/search` | Query `q` required, `page`, `size`, optional `tag`, optional `storeId` | Same page response as list | `400` missing/short query, invalid filters | Anonymous, bounded |
| `GET /api/mobile/recipes/{recipeId}` | Path UUID | `MobileRecipeDetail` with recipe fields, ingredients, steps, tags | `400` invalid UUID, `404` not found/unpublished | Anonymous |
| `GET /api/mobile/recipes/{recipeId}/product-mapping?storeId=...&storeCode=...` | Optional store context | `RecipeProductMappingResponse` with recipe id, store context, ingredient statuses and mapped product DTOs | `400` invalid storeId, `404` unpublished recipe, `409` only for impossible conflicting store params if needed | Anonymous, no list mutation |

Suggested mobile DTO shapes:

- `MobileRecipeSummary`: `id`, `slug`, `title`, `summary`, `imageUrl`, `servings`, `prepTimeMinutes`, `cookTimeMinutes`, `totalTimeMinutes`, `tags`, `mappedIngredientCount`, `totalIngredientCount`.
- `MobileRecipeDetail`: summary fields plus `description`, `ingredients`, `steps`.
- `MobileRecipeIngredient`: `id`, `position`, `displayName`, `canonicalName`, `quantity`, `quantityText`, `unitCode`, `unitDisplayName`, `preparationNote`, `optional`.
- `MobileRecipeStep`: `position`, `instruction`, `durationMinutes`.
- `IngredientMappingStatus`: `ingredientId`, `status` (`MAPPED`, `UNMAPPED`, `MULTIPLE_CANDIDATES`, `UNAVAILABLE_IN_STORE`, `PRODUCT_WITHOUT_LAYOUT`), `product`, `candidates`, `confidence`, `manuallyConfirmed`, `reason`.
- `MappedRecipeProduct`: `id`, `name`, `price`, `layoutCode`, `storeId`, `storeCode`.

Admin routes:

| Route | Purpose | Notes |
| --- | --- | --- |
| `GET /api/admin/recipes?page=&size=&status=&q=&tag=` | List recipes | Protected, paginated, `size` max 100 |
| `POST /api/admin/recipes` | Create recipe | Request includes metadata, optional ingredients/steps/tags |
| `GET /api/admin/recipes/{recipeId}` | Load admin detail | Includes draft/archived records |
| `PUT /api/admin/recipes/{recipeId}` | Update recipe metadata | Validates title, status, times, servings |
| `PATCH /api/admin/recipes/{recipeId}/publish` | Publish | Requires title, at least one ingredient, one step, valid status; mappings can be incomplete but readiness warnings return |
| `PATCH /api/admin/recipes/{recipeId}/deactivate` | Move from published to draft or inactive state | Hides from mobile |
| `PATCH /api/admin/recipes/{recipeId}/archive` | Archive | Preferred over hard delete |
| `POST /api/admin/recipes/{recipeId}/ingredients` | Add ingredient | Ordered child |
| `PUT /api/admin/recipes/{recipeId}/ingredients/{ingredientId}` | Update ingredient | Reorder support either here or through batch reorder |
| `DELETE /api/admin/recipes/{recipeId}/ingredients/{ingredientId}` | Remove ingredient | Child removal |
| `POST /api/admin/recipes/{recipeId}/steps` | Add step | Ordered child |
| `PUT /api/admin/recipes/{recipeId}/steps/{stepId}` | Update step | |
| `DELETE /api/admin/recipes/{recipeId}/steps/{stepId}` | Remove step | |
| `GET /api/admin/recipe-tags` | List tags | Query by status/q |
| `POST /api/admin/recipe-tags` | Create tag | Unique code |
| `PUT /api/admin/recipe-tags/{tagId}` | Update tag | |
| `GET /api/admin/recipes/{recipeId}/mapping-status?storeId=` | Preview mapping readiness | Same status concepts as mobile, includes admin details |
| `GET /api/admin/recipes/{recipeId}/ingredients/{ingredientId}/mapping-suggestions?storeId=&q=&size=` | Suggest mappings | Uses product search, synonyms, canonical names |
| `PUT /api/admin/recipes/{recipeId}/ingredients/{ingredientId}/product-mapping` | Confirm mapping | Request has product id, store id/code, mapping type, confidence, manuallyConfirmed |
| `DELETE /api/admin/recipes/{recipeId}/ingredients/{ingredientId}/product-mapping/{mappingId}` | Archive/remove mapping | No hard delete needed |

Admin request/response rules:

- Validation errors return `400` with a message that the existing Admin UI `fetchJson` can display.
- Unauthorized/forbidden follows existing Keycloak and role behavior (`401`/`403`).
- `404` for missing recipe/ingredient/step/tag/mapping.
- `409` for duplicate slug, duplicate tag code, duplicate step/ingredient position, or conflicting active mapping.
- Mapping suggestions should cap result size, default 10, max 25.
- Publish/deactivate/archive should create audit logs if consistent with existing audit service patterns.

### 7. iOS model and manager integration

Add recipe-specific models under `swift/indooro-EinkaeuferFinal/indooroApp/Models`, for example `RecipeModels.swift`:

- `RecipeSummary`
- `RecipeDetail`
- `RecipeIngredient`
- `RecipeStep`
- `RecipeTag`
- `RecipeProductMappingResponse`
- `RecipeIngredientMappingStatus`
- `MappedRecipeProduct`

Add a recipe data store/client under `Managers`, for example `RecipeStore.swift`:

- `@Published var recipes`
- `@Published var selectedRecipe`
- `@Published var mappingResponse`
- `@Published var isLoading`
- `@Published var errorMessage`
- `loadRecipes(page:size:tag:)`
- `searchRecipes(query:page:size:)`
- `loadRecipe(id:)`
- `loadMapping(recipeId:store:)`

Keep API base configuration aligned with existing `ProductSearchStore` and `BeaconManager`; a later cleanup can centralize `apiBase`.

### 8. iOS SwiftUI surface

Preferred UX:

- Add `AppSection.recipes` and a `RecipesPage` tab labeled `Rezepte`, or integrate `RecipesPage` under Planung if the team wants to keep four tabs.
- Add a recipe entry card in `HomeDashboardView` so Start can open recipes.
- Keep recipe planning separate from `ProductSearchStore`; recipes should use `RecipeStore`.

Views:

- `RecipesPage`: top-level recipe browsing with loading/error/empty states.
- `RecipeListView`: list/grid of `RecipeCard`.
- `RecipeSearchView`: search field and results.
- `RecipeDetailView`: title, image, tags, times, portions, ingredients, steps.
- `RecipeIngredientList`: displays ingredients and mapping state.
- `AddRecipeToShoppingListSheet`: lets user review mapped/unmapped ingredients, choose selected list, confirm add.
- `IngredientMappingStatusView`: mapped, unmapped, multiple candidates, unavailable, no layout.
- `RecipeCard`: summary card with title, tags, time, servings.

Accessibility:

- Use semantic labels for add, mapping status, and recipe metadata.
- Dynamic Type support for recipe details and ingredient rows.
- Do not encode mapping status only by color.

Offline/error:

- Recipe search/list/detail are online behavior in MVP.
- Already loaded recipe detail can remain visible while mapping refresh fails.
- Mapping failure blocks add confirmation for unknown mapped products but still allows user to skip or add free ingredient entries.

### 9. Shopping-list conversion logic

Extend `ShoppingListItem` to support recipe source metadata and free entries:

- `productID: Int?` instead of required for all items, with backward-compatible decode of existing stored items.
- `price: Double?` and `layoutCode: String?` for free/unmapped entries.
- New optional fields: `sourceRecipeId`, `sourceRecipeName`, `ingredientName`, `ingredientQuantity`, `ingredientUnit`, `mappingConfidence`, `manuallyConfirmed`.
- Consider `sourceSummaryNote` or a lightweight array of recipe source refs if merged products need multiple recipe origins.

Add a batch method such as `addRecipeIngredients(_:to:)` to `ShoppingListManager` rather than duplicating merge logic in views.

Conversion rules:

- Mapped ingredient with product id: create a normal product-backed item. Set `name` to product name, copy price/layoutCode, preserve ingredient quantity/unit/source fields.
- Unmapped ingredient: user can skip or add as free entry. Free entry has `productID == nil`, `layoutCode == nil`, `price == nil`, `name` based on ingredient display name, and source fields set.
- Duplicate mapped product: merge with open item matching `productID + layoutCode`; increment quantity conservatively and merge notes/source metadata.
- Duplicate free ingredient: merge by normalized ingredient name plus source recipe id when sensible, or keep separate if recipes differ and the user needs clarity.
- Completed duplicate: do not silently satisfy new need with completed item; create an open item or reopen according to explicit UI behavior.
- `2 eggs` mapping to `10 eggs`: shopping-list quantity defaults to 1 package; `2 eggs` is preserved as ingredient metadata or note.
- `250 g flour` mapping to `1 kg flour`: no fractional package quantity; quantity remains 1 unless future package metadata supports optimization.
- Product without layout: product-backed item is allowed but appears unresolved.
- No product: free item appears unresolved and never sets a route target.

Transfer/import impact:

- If free entries are exportable, bump the transfer package version and make old imports still decode.
- If free entries are not included in transfer MVP, the export UI must clearly omit or convert them to note-only entries.

### 10. Admin workflow

Admin recipe management should be plain, dense, and operational like the existing Admin Platform:

1. Admin creates or edits recipe metadata.
2. Admin adds ordered ingredients and steps.
3. Admin assigns tags/categories.
4. Admin opens mapping preview.
5. Backend proposes products using normalized ingredient name, synonyms, category hints, and store-scoped product search where supplied.
6. Admin confirms one product or marks ingredient intentionally unmapped.
7. Preview shows mapped, unmapped, ambiguous, unavailable, and no-layout states.
8. Admin publishes recipe once core validation passes.
9. Mobile only sees published recipes.

Validation:

- Title required.
- Servings positive.
- Time fields non-negative.
- At least one ingredient and one step for publish.
- Tag codes unique.
- Ingredient and step positions unique per recipe.
- Product mapping requires product id and must resolve against current catalog before publish readiness reports it as routable.

Roles:

- MVP: `admin` only.
- Future: `region-manager`/`store-manager` could curate store-specific mappings, but only after ownership/scope rules are specified.

## Risks / Trade-offs

- Unscharfes Produkt-Mapping -> Mitigation: only confirmed exact product mappings are auto-addable; ambiguous suggestions remain explicit.
- Einheiten-/Mengen-Konvertierung -> Mitigation: preserve recipe quantity metadata; avoid package optimization in MVP.
- Store-spezifische Produkte -> Mitigation: accept `storeId/storeCode` in mapping endpoints and verify product resolution before marking mapped.
- Produkte ohne Layoutposition -> Mitigation: allow list display but mark unresolved; do not route.
- Doppelte Listenitems -> Mitigation: reuse/extend existing `productID + layoutCode` merge rule and batch add through `ShoppingListManager`.
- DTO-Brueche between backend and Swift -> Mitigation: add Codable models that tolerate missing optional image/mapping fields and backend tests for DTO shapes.
- Migration/seed data -> Mitigation: additive Flyway migration, small demo seed only if needed, rollback by archiving feature data or reverting migration in non-production.
- UI-Komplexitaet -> Mitigation: separate recipe browsing from product planning and keep Add sheet focused on mapped/unmapped ingredient decisions.
- Offline/network errors -> Mitigation: explicit loading/error/empty states; recipe data online-only for MVP.
- Performance with many recipes -> Mitigation: pagination, indexed status/title/tag fields, bounded mapping suggestions.
- Free shopping-list entries affect transfer/routing -> Mitigation: optional product fields with compatibility decode and unresolved route handling tests.

## Migration Plan

1. Add Flyway migration for recipe tables and constraints.
2. Add entities, repositories, services, DTOs, and resources without changing existing product/store routes.
3. Add admin recipe APIs behind existing admin auth.
4. Add mobile read routes and verify they remain anonymous.
5. Add a small seed/demo recipe set only if useful for manual app validation.
6. Add iOS recipe models/store/views and local shopping-list metadata migration.
7. Run backend tests, OpenSpec validation, and iOS build for `MCindooroApp`.

Rollback:

- Backend routes are additive; disabling Admin UI links and mobile recipe entry points hides the feature.
- Database rollback in production should prefer archiving/deactivating recipes rather than dropping tables after data exists.
- If iOS free-entry migration causes issues, keep product-backed recipe add only and show unmapped ingredients as not-added until a transfer-safe free-entry migration is ready.

## Implementation Plan

Phase 1: Analysis

- Files/modules: OpenSpec specs; `swift/indooro-EinkaeuferFinal/indooroApp/Models`, `Managers`, `Views/Main`; backend `resource`, `admin/entity`, `admin/service`, `db/migration`, Admin UI files.
- Tasks: verify project target membership, existing app build, API base configuration, current product DTO shape, and test harness.
- Tests: no code tests yet; record findings.
- Acceptance: target app and backend integration points are confirmed.

Phase 2: OpenSpec Proposal/Design/Spec-Deltas

- Files/modules: `openspec/changes/add-recipe-shopping-list-integration/**`.
- Tasks: maintain proposal, design, specs, and task checklist.
- Tests: `openspec status --change add-recipe-shopping-list-integration`; `openspec validate --all --strict`.
- Acceptance: change is apply-ready.

Phase 3: Data Model/Migration

- Files/modules: `backend/indooro_server/src/main/resources/db/migration`, `admin/entity`, `admin/repository`.
- Tasks: add recipe entities and repositories; create Flyway migration; optional seed data.
- Tests: Quarkus migration startup test; repository/service tests.
- Acceptance: tables, constraints, and indexes exist and app starts cleanly.

Phase 4: Backend DTO/API

- Files/modules: `admin/dto`, `resource/mobile`, `resource/admin`, `admin/service`.
- Tasks: add mobile recipe list/search/detail/mapping; add admin recipe CRUD and mapping APIs.
- Tests: REST-assured tests for public mobile routes, protected admin routes, validation errors, pagination.
- Acceptance: published recipes are public; drafts are hidden; admin mutations are protected.

Phase 5: Admin CRUD/Mapping

- Files/modules: Admin static `index.html`, `app.js`, `app.css`.
- Tasks: add recipe navigation, forms, recipe list/detail, ingredient/step editors, tags, mapping suggestions, readiness preview.
- Tests: manual browser smoke; API error handling; role UI checks.
- Acceptance: admin can create, map, preview, publish, deactivate recipe.

Phase 6: iOS Models/API Client

- Files/modules: `Models/RecipeModels.swift`, `Managers/RecipeStore.swift`.
- Tasks: add Codable DTOs, list/search/detail/mapping calls, loading/error state.
- Tests: lightweight decoding tests if iOS test target exists; otherwise build plus manual mocked payload review.
- Acceptance: app can decode backend recipe DTOs.

Phase 7: Recipe List/Detail

- Files/modules: `ContentView`, `HomeDashboardView`, new recipe views.
- Tasks: add RecipesPage/list/search/detail cards and navigation.
- Tests: Xcode build; SwiftUI preview if practical; manual simulator smoke.
- Acceptance: user can list/search/open recipe details.

Phase 8: Add-to-list Integration

- Files/modules: `ShoppingModels`, `ShoppingListManager`, `ShoppingFeatureViews`, recipe add sheet.
- Tasks: add source metadata, free-entry support, batch add, merge rules, active-session refresh.
- Tests: unit/manual tests for duplicate product merge, free entry unresolved, recipe metadata persistence.
- Acceptance: mapped ingredients add as normal products and duplicates are controlled.

Phase 9: Mapping Status UI

- Files/modules: recipe views and shopping-list rows.
- Tasks: show mapped/unmapped/multiple/unavailable/no-layout states; display source recipe context in list where useful.
- Tests: manual scenarios with all mapping statuses.
- Acceptance: unmapped ingredients are never mistaken for routable products.

Phase 10: Tests/Polishing

- Files/modules: backend tests, iOS build, Admin UI smoke, OpenSpec.
- Tasks: run backend tests, OpenSpec validation, `xcodebuild` for scheme, manual route smoke.
- Tests: `./mvnw test`; `openspec validate --all --strict`; `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp build`.
- Acceptance: existing store, beacon, layout, product search, and shopping-tour flows remain functional.

## Acceptance Criteria

- Recipes are loaded from the backend through anonymous mobile APIs.
- A user can open recipe details in the modern iOS shopper app.
- Ingredients, steps, times, portions, tags, and optional image state are displayed.
- Ingredients show product mapping status when a mapping exists.
- A recipe can add mapped ingredients to the selected local shopping list.
- Existing products are not duplicated uncontrollably when recipe items are added.
- Unmapped ingredients are visible and handled as skipped or local free/unresolved entries.
- The shopping tour routes mapped recipe products through existing product/layout navigation.
- Products without layout or free ingredients remain unresolved and do not break routing.
- Admin can create/edit/deactivate/publish recipes and manage mappings.
- Backend tests cover recipe APIs and validation.
- The iOS app builds with project `swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj` and scheme `MCindooroApp`.
- Existing beacon, store, layout, product search, and routing features remain unchanged.
