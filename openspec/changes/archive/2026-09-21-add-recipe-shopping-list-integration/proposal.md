## Why

Indooro already lets anonymous iOS shoppers search products, add them to a local shopping list, and route through a selected or detected store. Recipes are a natural planning entry point for the modern shopper app because they turn meal intent into routable shopping-list products without introducing customer accounts or backend-synchronized lists.

This change defines the backend recipe catalog, ingredient-to-product mapping, admin maintenance workflow, and iOS integration needed to add recipes safely while preserving existing store detection, product search, layout, and shopping-tour behavior.

## What Changes

- Add a backend-managed recipe catalog with published/archived lifecycle, recipe ingredients, ordered preparation steps, timing, portions, tags/categories, and optional image metadata.
- Add ingredient-to-product mapping so a generic recipe ingredient can resolve to an existing catalog product, optionally scoped by store and with confidence/manual-confirmation metadata.
- Add anonymous mobile recipe APIs for listing, searching, opening recipe details, and loading mapping status for the selected/detected store.
- Keep shopping-list persistence local to the iOS app; recipe add-to-list uses the existing `ShoppingListManager` path rather than creating backend customer shopping lists.
- Extend local shopping-list item metadata so recipe-sourced products can keep source recipe and ingredient context without breaking normal product-added items.
- Show unmapped ingredients explicitly in the iOS recipe add flow and shopping-list context instead of inventing product or shelf locations.
- Add protected Admin Platform recipe management for recipe CRUD, ingredient/step/tag editing, mapping suggestions, manual product mapping confirmation, publish/deactivate, and validation.
- Define a conservative MVP that supports curated recipes and manually confirmed product mappings while leaving AI suggestions, nutrition, allergens, ratings, personalization, and full quantity optimization out of scope.
- No breaking changes to existing public product, mobile store, layout, beacon, or local shopping-list workflows.

## Capabilities

### New Capabilities

- `recipe-catalog-shopping`: Backend recipe catalog, ingredient/product mapping, mobile recipe APIs, and recipe-to-shopping-list conversion contract.

### Modified Capabilities

- `domain-model`: Adds PostgreSQL recipe, recipe ingredient, recipe step, recipe tag, ingredient mapping, optional synonym, and optional unit records with audit/lifecycle semantics.
- `mobile-shopping-lists`: Extends local iOS shopping-list behavior for recipe-sourced items, merge rules, source metadata, and visible unmapped ingredients/free entries.
- `admin-platform-management`: Adds protected Admin Platform workflows and permissions for recipe content, tags, ingredients, steps, mappings, suggestions, publish/deactivate, and validation.

## Impact

- Backend Quarkus API under `backend/indooro_server`, including new JPA entities/repositories/services/resources, DTOs, Flyway migrations, and tests.
- PostgreSQL stores recipe operational data; OpenSearch product documents remain the source for product identity, price, store scope, and layout code.
- Public/anonymous mobile APIs under `/api/mobile/recipes` are added; existing `/api/products/search`, `/api/mobile/stores`, and `/api/mobile/stores/{storeId}/layout/current` remain compatible.
- Protected admin APIs under `/api/admin/recipes` and related mapping/tag endpoints are added for `admin` users in the MVP, with future scope for scoped managers if product ownership rules are defined.
- Admin static frontend under `backend/indooro_server/src/main/resources/META-INF/resources/admin` gains recipe management and mapping review surfaces.
- iOS target is exclusively `swift/indooro-EinkaeuferFinal/indooroApp` with Xcode project `swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj` and scheme `MCindooroApp`.
- Existing SwiftUI integration points include `ContentView`, `HomeDashboardView`, `ShoppingFeatureViews`, `ProductSearchStore`, `ShoppingListManager`, `Product`, `ShoppingModels`, and `StoreMapPage`.
- Existing legacy Swift trees are comparison-only or out of scope: `swift/indooro-/indooroApp` may be referenced for ideas, while `swift/indooroApp/indooroApp` must not be the implementation target.
