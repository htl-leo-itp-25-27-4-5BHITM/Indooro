## Why

The audit of 2026-09-17 (`docs/specs/AUDIT.md`) compared the canonical iOS app with the backend DTOs and the permanent OpenSpec requirements. It found contract defects that silently break features and client behavior that violates already accepted requirements:

- Every „Nicht mehr für dieses Produkt“ tap fails with HTTP 400 because the app sends `suppressMinutes=1440` while `UpsellDismissRequest` allows at most 30 (the service itself clamps to 30 days).
- The store overview invents coordinates from city names and hash offsets, a regression of the archived change `2026-05-19-add-real-store-coordinates` (the fix only landed in the legacy tree).
- The 2D map presents low-confidence positions exactly like trusted ones; the low-confidence state is only visible in AR.
- Store addresses are never shown because the backend sends `address` and the app expects `street`/`zipCode`/`country`.
- The server's `fallback` flag for store layouts is ignored, so a default layout looks like the store's real layout.
- Product search is not store-scoped and one product without price or layout code empties the whole result list; network errors look like „no results“.
- The walkable graph ignores element rotation, so rotated shelves block the wrong cells.
- The planning section „Kunden kauften ebenfalls“ implies purchase analytics that do not exist.

These defects affect correctness and user trust now and must be fixed before the architectural modernization.

## What Changes

- Backend: accept `suppressMinutes` from 1 to 43 200 (30 days) in `UpsellDismissRequest`; iOS keeps sending 1 440 minutes.
- iOS: decode `address`, `source`, and `fallback` from mobile store and layout responses and show them.
- iOS: omit stores without valid persisted coordinates from the store overview map and list them separately as „Ohne Kartenposition“.
- iOS: render the Blue Dot in a degraded style with a status banner while the navigation state is low confidence or fewer than three usable beacons exist; show the navigation status message in the indoor header.
- iOS: send `storeId` and `storeCode` of the active store with product searches; decode product lists element-wise and skip invalid products; show a search error state with retry on transport or HTTP failures.
- iOS: validate HTTP status codes in `ProductSearchStore` and `RecipeStore`; decode ISO-8601 dates with and without fractional seconds.
- iOS: persist the last successfully applied layout per store and use it as fallback before the bundled layout; show which fallback is active.
- iOS: block rotated element footprints in the walkable graph. `accessAngle` is intentionally not used yet because the Admin editor has no defined semantics for it (new elements default to 90, export falls back to 0, no UI control).
- iOS: rename „Kunden kauften ebenfalls“ to „Passt gut dazu“.
- iOS: remove the unreachable duplicate product search in `BeaconManager` and the unused `UpsellRequest`/`UpsellSuggestionResponse` models.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ios-backend-integration`: store-scoped search, HTTP status validation, element-wise product decoding, date decoding, extended store/layout fields, dismissal window.
- `ios-store-map-experience`: store overview without invented coordinates, address subtitle, fallback badge, low-confidence rendering.
- `ios-product-planning`: honest quick-search label and search error state.
- `mobile-positioning-navigation`: persisted per-store layout cache and rotation-aware walkable graph.
- `mobile-store-detection`: store-layout failure behavior uses the per-store cache.

## Impact

- iOS: `Models/MobileStoreModels.swift`, `Models/Product.swift`, `Managers/BeaconManager.swift`, `Managers/ProductSearchStore.swift`, `Managers/RecipeStore.swift`, `Managers/UpsellSuggestionStore.swift`, `Utilities/IndoorGraph.swift`, `Managers/ShoppingListManager.swift`, `Views/Main/StoreMapPage.swift`, `Views/Main/MapView.swift`, `Views/Main/ShoppingFeatureViews.swift`, `Views/Components/UserLocationMarker.swift`.
- Backend: `admin/dto/UpsellDtos.java` validation annotation, `MobileUpsellResourceTest`.
- API: no route or response shape change; one validation bound is widened (backward compatible).
- Public/protected routes: unchanged.
- Tests: new backend validation test; iOS logic tests are added once the test target from `modernize-ios-client-architecture` exists, otherwise verified manually per task list.
