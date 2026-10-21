## Why

The sprint goal is that a supermarket operator brings a store with assortment, shelves and beacons into the system and sees whether it is ready. All building blocks exist (store create page, editor, beacon page, CSV import, readiness page, search index page), but an operator without a developer does not know the order of the steps or what to do next. The readiness page lists findings, but it does not say "you have not imported any products yet" or "the search does not find them".

## What Changes

- Admin UI: the store detail page gets a section "Einrichtung" with seven steps in a fixed order: store created, layout active (not the bundled default), shelves labelled, beacons registered and placed (identity complete and consistent), assortment imported, search finds the store's products, readiness without BLOCKING findings. Each step shows done, open, problem or "Nicht prüfbar" (a source did not load) with one sentence, and every step that is not done links to the page where it is fixed (editor, beacons page, CSV import, Suchindex, readiness page). Links to admin-only pages are replaced by a hint for other roles.
- The steps are derived only from endpoints that already exist: `GET /api/stores/{id}/readiness`, `GET /api/mobile/stores/{id}/layout/current` (field `fallback`), `GET /api/products?storeCode=` and `GET /api/products/search?storeCode=`. No backend, contract or migration change was needed; the existing role annotations are untouched. Products without a market (shared catalog) do not count as the store's assortment and are reported as a problem.
- Operator guide `docs/pilot-readiness/operations/MARKT_EINRICHTEN.md` (German, one page): preparation, the same seven steps, how to read the findings, who to ask. It is linked from the checklist section, `docs/pilot-readiness/operations/README.md` and `scripts/ops/README.md`.

## Impact

- Affected: `admin-ui` (`StoreDetailPage`, new `StoreSetupSection`, `storeSetup`, styles), docs, spec `admin-platform-management`.
- Read-only. The checklist adds three GET requests per page load next to the existing readiness page call; a failing request never blocks the page.
- The guide link points at the file on GitHub `main`; it works after this change is merged.
