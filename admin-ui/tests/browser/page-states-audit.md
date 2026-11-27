# Page state audit

The editor implementation under `src/editor/` is excluded. Its route wrappers use shared loading/error presentation; editor documents and editing behavior are unchanged.

| Admin route | Loading and errors | Empty next step |
| --- | --- | --- |
| Dashboard | Shared states; all summary requests refetched | Create a store or open stores; activity links to stores |
| Stores | Shared states; stores and region options refetched | Create store or reset filters |
| Store creation | Shared states; region options refetched | Create/check regions |
| Store details | Shared states; aggregate detail refetched | Manage beacons; open editor; check history again |
| QR anchors | Shared states; store and layout refetched | Create anchors in editor |
| Readiness | Shared states; report refetched, including 403 | Missing store links to stores; zero findings is a successful report |
| Regions | Shared list/detail states; refetch retains access checks | Create region or reset filters |
| Beacons | Shared states; inventory and store options refetched | Create beacon or reset filters |
| Categories | Shared states; categories refetched | Create category or reset search |
| Products | Shared states; stores/products/categories independently retried | Create product or reset filters |
| Recipes | Shared states; list and tags refetched | Create recipe or reset filters |
| Search index | Shared loading/error; refresh refetches overview | Existing reindex action creates the first version |
| Diagnostics | Shared states; both logs refetched | Manage stores or check logs again |
| Access assignments | Shared list/options states; independent refetch | Create access or reset filters |
| Session/unknown route | Shared loading, safe status messages, profile refetch | Sign in or return to overview |

API load failures distinguish network, 403, 404, session expiry and server failures. Technical response bodies and arbitrary exception strings are hidden. Existing form validation/conflict details and the authorized diagnostics log viewer remain available. Mutations retain their explicit save/recovery actions rather than automatically replaying writes.

Functional tests delay actual requests and cover empty lists and recovery from 500, 403, 404 and network failure on the five main lists. Existing empty visual cases remain; the stores error screenshot adds error coverage. Linux baselines must come from CI artifacts.
