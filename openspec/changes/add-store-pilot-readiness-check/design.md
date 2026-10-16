## Context

- Layout versions: PostgreSQL `layout_versions`, one ACTIVE per store (`StoreLayoutAdminService`); layout JSON contains `gridSize`, `elements` with `type`, `x`, `y`, `width`, `height`, `rotation`, `category`, `meter`, `label`, `layoutCode`, beacon identity fields.
- Products: OpenSearch index `products` with `id`, `name`, `price`, `layoutCode`, optional `storeId`/`storeCode` (`OpenSearchService`).
- Beacons: `beacons`, `beacon_assignments` tables; editor places assigned beacons as layout elements.
- Scope enforcement: `AdminAccessService` (admin all; region-manager region; store-manager store).
- Existing editor validation (`admin-ui/src/editor/validation.ts`) covers per-layout checks; product readiness exists on the product page. The report reuses the same matching rule as iOS: category base and meter must match exactly (`LayoutElement.matchesProductLayoutCode` in Swift, `matchesProductLayoutCode` fix series `5936ed4`).

## Goals / Non-Goals

Goals: one page that answers „Kann dieser Markt heute getestet werden?“ with concrete links.

Non-goals: automatic fixing, scheduled checks, notifications, positioning simulation beyond a simple radius count (the detailed planner is `add-beacon-placement-planner`).

## Decisions

1. **Server-side evaluation.** The report is computed in the backend so it uses the same data the app receives (active layout, store products). Pure evaluation logic in a plain Java class (`StoreReadinessEvaluator`) with unit tests; resource only wires data.
2. **Matching rule.** Shared helper implementing exact category and meter match; covered by tests with the collision case `31` vs `310`.
3. **Beacon coverage warning.** For each walkable cell center count placed beacons within radius R (query parameter `radius`, default 8.0); warn if fewer than 3 for more than 5 % of walkable cells. Walls/shelves are not modeled as attenuation (documented limitation).
4. **Severity.** Blocking: no active layout, no entrance or more than one, product without shelf, target shelf without label. Warning: shelf without products, unplaced beacon, low coverage, implausible grid size.
5. **UI.** One page under the store detail; list grouped by severity; each finding links to the editor with the element selected or to the product edit; „Als Markdown kopieren“ for the checklist.

## Risks / Trade-offs

- Large product sets: evaluate with paged OpenSearch queries; a pilot store has hundreds, not tens of thousands, of products.
- Divergence from iOS matching: guarded by shared test vectors copied from the Swift `ShelfMatchingTests`.

## Migration / Rollback

New read-only endpoint and page; rollback = revert.
