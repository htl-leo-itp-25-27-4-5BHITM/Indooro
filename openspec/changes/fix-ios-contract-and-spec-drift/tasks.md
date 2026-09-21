## 1. Preparation

- [ ] 1.1 Re-read `docs/specs/AUDIT.md` sections 2 and 3.2 and confirm each defect still reproduces on `main`.
- [ ] 1.2 Capture a live `POST /api/mobile/upsell/plan` response from LeoCloud and record whether `expiresAt` contains fractional seconds.
- [ ] 1.3 Capture live responses of `GET /api/mobile/stores` and `GET /api/mobile/stores/{storeId}/layout/current` as JSON fixtures under `swift/indooro-EinkaeuferFinal/Fixtures/`.

## 2. Backend Dismissal Bound

- [ ] 2.1 Change `UpsellDtos.UpsellDismissRequest.suppressMinutes` to `@Min(1) @Max(43200)`.
- [ ] 2.2 Add a `MobileUpsellResourceTest` case that posts `suppressMinutes=1440` and expects HTTP 2xx.
- [ ] 2.3 Add a test case that posts `suppressMinutes=43201` and expects HTTP 400.
- [ ] 2.4 Add a dismissal request with `suppressMinutes=1440` to `api-tests/httpyac/06-upsell.http`.

## 3. Shared Decoding

- [ ] 3.1 Add `JSONDecoder.indooro` with ISO-8601 decoding that accepts fractional and non-fractional seconds.
- [ ] 3.2 Use `JSONDecoder.indooro` in `UpsellSuggestionStore`, `RecipeStore`, `ProductSearchStore`, `BeaconManager`, and `ShoppingTransferService`.
- [ ] 3.3 Add `LossyDecodableArray<Element: Decodable>` and decode product lists element-wise in `ProductSearchStore`.
- [ ] 3.4 Extend `MobileStoreSummary` with optional `address` and use it as first choice in `displaySubtitle`.
- [ ] 3.5 Extend `MobileLayoutResponse` with optional `source: String?` and `fallback: Bool?`.

## 4. HTTP Status And Errors

- [ ] 4.1 Validate HTTP status 200–299 in `ProductSearchStore` and `RecipeStore` and map other codes to a German error message containing the status.
- [ ] 4.2 Add `@Published var errorMessage: String?` to `ProductSearchStore`; set it on transport, HTTP, and decoding failures; clear it on a new request.
- [ ] 4.3 Show „Suche fehlgeschlagen“ with the error message and a „Erneut versuchen“ button in the planning results section and the map search panel.

## 5. Store-Scoped Search

- [ ] 5.1 Add optional `store: MobileStoreSummary?` to `ProductSearchStore.searchProducts(query:size:)` and append `storeId` and `storeCode` query items when present.
- [ ] 5.2 Pass `beaconManager.activeLayoutStore ?? beaconManager.detectedStore` from `ProductsPage` and `StoreMapPage`.
- [ ] 5.3 Remove `BeaconManager.searchProducts`, `searchResults`, `isSearching`, `latestSearchRequestID`, and `clearSearch`.

## 6. Store Overview

- [ ] 6.1 Delete `StoreMapPage.fallbackCoordinate(for:)` and return `nil` from `coordinate(for:)` for missing or out-of-range values.
- [ ] 6.2 Add the chip row „Ohne Kartenposition“ for active stores without coordinates, selectable with the same `selectStore` action.
- [ ] 6.3 Show `displaySubtitle` (address) on `StoreOverviewCard`.
- [ ] 6.4 Rename the overview title from „SPAR-Filialen“ to „Filialen“.

## 7. Layout Fallback And Cache

- [ ] 7.1 Add `LayoutCacheStore` that writes and reads `Application Support/LayoutCache/<storeId>.json` and `default.json` with `isExcludedFromBackup = true`.
- [ ] 7.2 Save the decoded layout response after every successful store or default layout application.
- [ ] 7.3 On store layout failure, apply the cached layout for that store if present and set the description to „<store> • Offline-Kopie vom <Datum>“; otherwise keep the current failure behavior.
- [ ] 7.4 On default layout failure, try `default.json` before the history fallback.
- [ ] 7.5 When `fallback == true`, set the description to „<store> • Standard-Layout (kein aktives Filial-Layout)“ and show a warning badge in the indoor header.

## 8. Low-Confidence Rendering

- [ ] 8.1 Publish `isPositionTrusted` from `BeaconManager` as `trackingMode == .debugNoBeacons || (!isLowConfidence && activeMeasurementCount >= 3)`.
- [ ] 8.2 Add `isTrusted` to `UserLocationMarker`; draw 45 % opacity plus a dashed 3 m uncertainty ring when not trusted.
- [ ] 8.3 Show the status banner with `navigationStatusMessage ?? "Position ungenau"` and „Position setzen“ in the indoor header while not trusted.
- [ ] 8.4 Implement „Position setzen“ by setting `tapSetsTarget = false` and showing the „Tippen setzt Position“ badge.
- [ ] 8.5 Change the AR low-confidence text to „Signal schwach. Kalibrierung empfohlen (Position setzen).“

## 9. Walkable Graph

- [ ] 9.1 Replace axis-aligned blocking in `IndoorGraphBuilder.fromLayout` with rotated-rectangle cell coverage.
- [ ] 9.2 Add unit-testable geometry helpers for rotated-rectangle cell coverage (cell center inside, edge intersection).
- [ ] 9.3 Log shelves whose nearest free node is unreachable from the layout entrance in DEBUG builds.
- [x] 9.4 Record in `docs/specs/ROADMAP.md` that `accessAngle` semantics must be defined in `store-layout-management` and the editor before the client uses it.

## 10. Cleanup And Copy

- [ ] 10.1 Rename the planning section to „Passt gut dazu“.
- [ ] 10.2 Delete `UpsellRequest` and `UpsellSuggestionResponse` from `UpsellModels.swift`.

## 11. Verification

- [ ] 11.1 Run `npx -y @fission-ai/openspec@1.3.1 validate fix-ios-contract-and-spec-drift --strict`.
- [ ] 11.2 Run `./mvnw test` in `backend/indooro_server`.
- [ ] 11.3 Run `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build`.
- [ ] 11.4 Manually verify in the simulator: dismissal returns 2xx in the debug log; store without coordinates appears only in „Ohne Kartenposition“; address is shown; search in a selected store sends `storeId`; airplane mode shows „Suche fehlgeschlagen“; debug layout with rotated shelf routes around it.
- [ ] 11.5 Manually verify on a device with fewer than three beacons that the Blue Dot is degraded and the banner is shown.
