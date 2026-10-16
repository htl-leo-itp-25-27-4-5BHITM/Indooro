## 1. Setup

- [ ] 1.1 After the admin rebuild merge: branch `pilot/web-finder` from `origin/main`; copy this change from `origin/pilot/first-store`; run the backend locally or use LeoCloud read-only APIs.
- [ ] 1.2 Read the current `customer/` files and `openspec/specs/customer-web-experience/spec.md`.

## 2. Pure Modules (node --test)

- [ ] 2.1 `shelf-text.js` with test vectors from the Swift `ShelfLocationDescriptor`/`ShelfMatchingTests`.
- [ ] 2.2 `layout.js`: walkable grid incl. rotated shelves; tests.
- [ ] 2.3 `route.js`: A* and nearest-neighbor order; tests.

## 3. UI

- [ ] 3.1 Store selection from URL or list; search with debounce and error states (German).
- [ ] 3.2 Result card with shelf text and „Auf Karte zeigen“; SVG map with highlight and zoom.
- [ ] 3.3 List with walking order, „Erledigt“, route polyline; anchor start from `&a=`.
- [ ] 3.4 Mobile-first layout, readable at 360 px width, large tap targets, no cookies/analytics.

## 4. Verification

- [ ] 4.1 `node --test` green; manual check on an Android phone and an iPhone browser (human step).
- [ ] 4.2 PR → `main` (review by Person B for the backend resource folder); `STATUS.md`.
