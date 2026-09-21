## Context

Current state (commit `63a42d4`):

| Area | Current behavior | Source |
| --- | --- | --- |
| Dismissal | `reportDismissal` sends `suppressMinutes: 24 * 60`; DTO has `@Min(1) @Max(30)`; service clamps to `30 * 24 * 60` | `UpsellSuggestionStore.swift`, `UpsellDtos.java`, `UpsellSuggestionService.java:549` |
| Store coordinates | `coordinate(for:)` returns `fallbackCoordinate(for:)` for missing values | `StoreMapPage.swift:789-827` |
| Store address | Backend `MobileStoreSummary.address` = formatted street, zip, city | `MobileStoreService.address(StoreEntity)` |
| Layout fallback flag | Backend `MobileLayoutResponse.fallback`, `source` | `MobileDtos.java` |
| Low confidence | `isLowConfidence`, `navigationStatusMessage` published but not shown in 2D | `MapView.swift`, dead `HeaderView.swift` |
| Search | `ProductSearchStore` sends `q`, `size`; decodes `[Product]` all-or-nothing | `ProductSearchStore.swift` |
| Graph | Axis-aligned blocking from `x`, `y`, `width`, `height` | `IndoorGraph.swift:351-372` |
| Layout fallback chain | store layout → status only; default → history latest → bundle | `BeaconManager.swift:1619-1835` |

## Goals / Non-Goals

**Goals:** fix every defect listed in the proposal with minimal, reviewable edits in the existing architecture.

**Non-Goals:** no `async/await` migration, no `@Observable` migration, no module split, no new backend routes. Those belong to `modernize-ios-client-architecture`.

## Decisions

1. **Widen the DTO bound instead of shrinking the client value.** The UI text „Nicht mehr für dieses Produkt“ and the service clamp (30 days) show that minutes were intended. `@Max(43200)` keeps both consistent.
2. **Element-wise product decoding.** Introduce `LossyDecodableArray<Product>` that decodes each element independently and drops failures, and log the number of dropped products in DEBUG builds.
3. **Low-confidence rendering rule.** The Blue Dot is „trusted“ only WHILE `navigationStateMachine.state.mode != .lowConfidence` and at least three measurements are active. Otherwise the marker is drawn at 45 % opacity with a dashed uncertainty ring of 3 m radius and the indoor header shows a banner with `navigationStatusMessage ?? "Position ungenau"` and the action „Position setzen“, which disables „Tap setzt Ziel“ so the next map tap calibrates the position. The AR hint text is changed from „(Ich stehe hier)“ to „(Position setzen)“. The raw position remains visible so customers keep orientation.
4. **Layout cache.** Store the last successfully applied `MobileLayoutResponse` per store id as JSON in `Application Support/LayoutCache/<storeId>.json` (excluded from iCloud backup) and the last default layout as `default.json`. Fallback order for a store: server → cache for that store → bundled layout. The description shows „Offline-Kopie vom <Datum>“ or „Bundle-Layout“.
5. **Rotated footprints.** For an element with rotation θ (degrees) rotate its rectangle around its center and block every grid cell whose center lies inside the rotated rectangle, plus cells intersected by its edges. `accessAngle` stays unused: `admin/editor.js` defaults new elements to `90`, exports missing values as `0`, and offers no control, so the value carries no reliable meaning. Defining it is tracked as Roadmap item P2-06.
6. **Store overview without coordinates.** Stores without valid coordinates are excluded from pins and from camera fitting, and are listed in a separate chip row „Ohne Kartenposition“ so they remain selectable (manual selection must stay possible).
7. **Date decoding.** A shared `JSONDecoder.indooro` uses a custom strategy that tries `ISO8601DateFormatter` with `.withFractionalSeconds` and then without.

## Risks / Trade-offs

- Rotated blocking can close narrow aisles that were previously (incorrectly) open → validate with `layout-demosupermarkt.json` and the LeoCloud store layouts; log unreachable shelves.
- Cached layouts can be outdated → cache entries show their timestamp and are replaced on every successful load.
- Widening the DTO bound allows 30-day suppressions from any anonymous client → acceptable because suppression only reduces prompts; rate limiting is addressed in `modernize-ios-client-architecture` / `protect-legacy-write-endpoints`.

## Migration Plan

1. Backend DTO change and test, deploy backend.
2. iOS changes in the order of `tasks.md`; each group is independently shippable.
3. Rollback: revert the commits; the cache directory can be deleted safely.
