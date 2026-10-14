# Admin route cutover and rollback

The new React pages are packaged at `/admin/next/*`. Each existing entry loads `route-cutover.js` from the protected admin resources. The committed map redirects `/admin/`, `/admin/regions/`, `/admin/stores/`, `/admin/stores/detail/`, and `/admin/server-logs/` to their candidate pages; the other five entries still serve their existing static pages. This is a local branch and image change, with no production rollout.

| Map key | Current entry | Candidate entry |
| --- | --- | --- |
| `dashboard` | `/admin/` | `/admin/next/` |
| `regions` | `/admin/regions/` | `/admin/next/regions/` |
| `stores` | `/admin/stores/` | `/admin/next/stores/` |
| `storeDetail` | `/admin/stores/detail/` | `/admin/next/stores/detail/` |
| `beacons` | `/admin/beacons/` | `/admin/next/beacons/` |
| `products` | `/admin/products/` | `/admin/next/products/` |
| `categories` | `/admin/categories/` | `/admin/next/categories/` |
| `recipes` | `/admin/recipes/` | `/admin/next/recipes/` |
| `editor` | `/admin/editor/` | `/admin/next/editor/` |
| `diagnostics` | `/admin/server-logs/` | `/admin/next/server-logs/` |

`storeDetail` is independent of `stores`, and the shared editor entry covers both `?storeId=...` and the admin-only global mode. The redirect preserves query parameters and URL fragments. Legacy HTML and scripts remain in the image, so changing one map value back to `false` and rebuilding restores that page without a data migration. The prior immutable image is the full rollback target.

Before enabling a map key, complete its row in `ROUTE_PARITY_MATRIX.md` with authenticated direct-link and refresh checks, each role and foreign scope, keyboard and accessible status checks, loading/empty/error/success, each existing action and server state, and an exercised rollback. Verify the editor's separate draft/publication semantics and anonymous mobile response for both editor modes. Build/package the candidate, run `node --test backend/indooro_server/src/test/js/admin-route-cutover.test.mjs`, then perform the live checks in `LIVE_STACK.md`. Changing a flag alone does not establish parity.

The URL switch uses a same-origin module loaded from each current entry. Existing paths still require Quarkus OIDC authentication, and the backend remains the authority for role and store scope. Direct `/admin/next/*` URLs remain available to testers independently of the cutover flags.

On 2026-10-12, `cd admin-ui && npm run test:live:cutover` passed against the running Quarkus/Keycloak stack. Playwright authenticated once, simulated each of the ten flags individually in the served map, followed the current URL with its query and fragment to the candidate, then restored the original map response and verified the old page. No committed flag was changed. This proves URL switching and rollback mechanics; route action and state parity remain separate gates.

On 2026-10-13, the Diagnostics parity row in `ROUTE_PARITY_MATRIX.md` passed its legacy/candidate action, role, keyboard, empty/error, deep-link, and rollback checks before its flag was enabled. The packaged cutover image then passed the full live workflow, all ten simulated switch/rollback pairs, and an unmodified `/admin/server-logs/?probe=committed#proof` request that landed on `/admin/next/server-logs/` with query and fragment intact. `/admin/` still served the legacy page. Reverting `diagnostics` to `false` or restoring the preceding immutable image restores the old Diagnostics entry.

Later on 2026-10-13, the Dashboard parity row passed authenticated legacy/candidate comparison for all three roles, direct refresh, scoped API counts, action destinations, keyboard, empty/error/retry, and simulated rollback. The old global Dashboard truncated Stores at 20 and missing Layouts at 9 in the grown local dataset; the candidate showed authoritative totals of 221 and 152. The candidate also hides legacy action links that scoped staff cannot use. The local Dashboard flag was then enabled. The current packaged image and actual committed redirect evidence are recorded in `RELEASE_EVIDENCE.md`; reverting only `dashboard` to `false` restores the old root entry.

On 2026-10-14, the Regions parity probe compared live legacy and candidate lists and keyboard CRUD with API post-state. Candidate conflict, empty, 503/retry, all three staff roles, and foreign-scope denial passed. Two captured screenshots and the reproducible script are in `evidence/regions/` and `admin-ui/scripts/live-regions-parity.mjs`. Image `sha256:45abaa98d29154177883b96ffbe854653be4b483124209d5eb11d006c52b0cf6` passed the unmodified `/admin/regions/?probe=committed#proof` redirect to the candidate and all ten intercepted switch/rollback pairs. Reverting only `regions` to `false` restores the old Regions entry on the next build; no migration is involved.

Later on 2026-10-14, `live-stores-list-parity.mjs` compared the same two fixture Stores in legacy and candidate lists for admin and checked both manager scopes. It ran both list create/edit paths with API readback, sort/filter/paging, direct refresh, keyboard detail navigation, injected 503/retry, empty state, and invalid-sort rejection. Fixtures were archived. Image `sha256:965e45066a22da74ee9b613cf3c990f945a456483b909f269b4c2f0102670996` passed the committed `/admin/stores/?probe=committed#proof` redirect and all ten intercepted switch/rollback pairs. Reverting only `stores` to `false` restores the old list entry. `storeDetail` and the five other gated entries remain independent.

On the subsequent `storeDetail` cutover, the expanded probe compared both detail pages for the same local Stores, exercised keyboard metadata edits, conflict recovery, Beacon assignment/release, empty and active Layout views, injected 503/retry, and archive with API/audit readback. Admin, Region Manager, and Store Manager scope checks passed. The committed old detail URL redirected with a real Store ID, query, and fragment to the rendered candidate detail. Image `sha256:a343f7fbf64ef4b6f3d61806134001fcaf14e6a2547b0cb1d48def606e7163a7` passed the full live workflow and all ten switch/rollback pairs. Reverting only `storeDetail` to `false` restores the old detail entry; the other five route flags remain disabled.
