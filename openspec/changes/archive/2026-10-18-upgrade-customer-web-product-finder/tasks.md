## 1. Setup

- [x] 1.1 Branch `pilot/web-finder` from `origin/pilot/first-store`; change files already present; tests run against mocked APIs (no backend needed).
- [x] 1.2 Read the current `customer/` files and `openspec/specs/customer-web-experience/spec.md`.

## 2. Pure Modules (node --test)

- [x] 2.1 `shelf-text.js` with test vectors from the Swift `ShelfLocationDescriptor`/`ShelfMatchingTests`.
- [x] 2.2 `layout.js`: walkable grid incl. rotated shelves; tests.
- [x] 2.3 `route.js`: A* and nearest-neighbor order; tests.

## 3. UI

- [x] 3.1 Store selection from URL or list; search with debounce and error states (German).
- [x] 3.2 Result card with shelf text and „Auf Karte zeigen“; SVG map with highlight and zoom.
- [x] 3.3 List with walking order, „Erledigt“, route polyline; anchor start from `&a=`.
- [x] 3.4 Mobile-first layout, readable at 360 px width, large tap targets, no cookies/analytics.

## 4. Verification

- [x] 4.1 `node --test` green (41), Playwright mobile viewports green (19). Manual check on an Android phone and an iPhone browser stays a human step before the pilot.
- [x] 4.2 PR → `pilot/first-store` (review by Person B for the backend resource folder); `STATUS.md`. (Beleg: PR #132 `pilot/web-finder` → `pilot/first-store` gemergt)
