## Why

Only iPhone users can use Indooro today; Android has no app. In a pilot with real customers, many test persons will have Android phones, and nobody wants to install an app for one shopping trip. A web product finder opened by scanning a QR code at the store entrance reaches everyone. A customer web view already exists (`backend/indooro_server/src/main/resources/META-INF/resources/customer/`, about 370 lines) but uses the legacy global layout (`/api/layout/current`), local category JSON and no store context.

## What Changes

- Rebuild the customer web view as a store-aware, mobile-first product finder (vanilla HTML/CSS/JS, no build step, no tracking): store from URL (`?store=<storeCode>`, optional `&a=<anchorId>` from QR anchors), product search, shelf location in words (same rules as the iOS app), map with the shelf highlighted, shopping list in walking order from the entrance (or from the scanned anchor), „Erledigt“.
- Use only public mobile APIs (`/api/mobile/stores`, `/api/mobile/stores/{id}/layout/current`, `/api/products/search` with store).
- Works offline-tolerant for a session (layout and results cached in memory/`sessionStorage`), no cookies, no analytics.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `customer-web-experience`: store-aware mobile product finder with shelf text, highlighted shelf and walking-order list.

## Impact

- Owner: Person C (Windows). Branch `pilot/web-finder` from `main` after the admin rebuild merge.
- Files: `backend/indooro_server/src/main/resources/META-INF/resources/customer/**` (owned by Person C for this change), JS unit tests runnable with `node --test`, Playwright smoke test with mocked API if the repo setup allows.
- No backend Java change. Privacy: no personal data, no cookies.
