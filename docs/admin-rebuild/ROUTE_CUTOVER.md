# Admin route cutover and rollback

The new React pages are packaged at `/admin/next/*`. Each existing entry loads `route-cutover.js` from the protected admin resources. The committed map now redirects only `/admin/server-logs/` to the candidate Diagnostics page; the other nine entries still serve their existing static pages. This is a local branch and image change, with no production rollout.

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
