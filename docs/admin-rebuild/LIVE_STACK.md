# Local admin acceptance stack

Current local image: `indooro-admin-rebuild:category-atomic-create-fixed` (`sha256:111d773a5a52703769ecff920ebca284bf44c5f885ba4dc0e808a70d111731f9`), runner SHA-256 `05c3dc36efbb305b7f51577bad1ca647303d8fb517f238d314f3d04917b4c015`. The preceding category preflight image is stopped as `indooro-admin-image-smoke-prev-category-atomic-fixed`. Category create now uses atomic OpenSearch create while legacy POST/PUT upsert remains available. Full `test:live` passed a real duplicate-code 409 and unchanged readback before successful create/edit; `test:live:cutover` passed ten rollback pairs and six redirects. Frontend lint, 66 unit, 97 browser and backend 135 tests passed. Six routes are enabled, four gated.

Prior local image: `indooro-admin-rebuild:category-preflight-candidate` (`sha256:97a920e829921cce02e8b575ab3c5b6b3724672522b916deefd59228d4e9e965`), runner SHA-256 `2e97eeb6d0834893322318e2a7f7d1367da9ea7feab3b566a156ff3dcd41546a`. The previous Beacon parity image is stopped as `indooro-admin-image-smoke-prev-category-preflight`. Candidate category create checks the exact code before POST and retains input for existing/failed lookups. Full `test:live` confirmed category `310` was not overwritten and a separate create/edit persisted; `test:live:cutover` passed ten rollback pairs and six redirects. Candidate lint, 66 unit, and 97 browser cases passed. Six routes are enabled; Categories, Products, Recipes, and Editor remain gated.

Prior local image: `indooro-admin-rebuild:beacon-parity-layout` (`sha256:7282bd961df89641b27c88195e80211bdeee72c2b3ceabfb40776baf0722c002`), runner SHA-256 `d97c2aaf29af4fb844c0456d7e371597f71621fae429bd73f5a3dbb507334c4e`. The preceding Beacon parity image is stopped as `indooro-admin-image-smoke-prev-beacon-parity`. Dedicated `test:live:beacons` passed legacy/candidate sort and action comparison, three staff scopes, manager edit/release, Store-context assignment, duplicate conflicts, stale-row suppression after 503 and keyboard retry, legacy bulk, and committed old-URL redirect. Full `test:live`, `test:live:stores`, and `test:live:cutover` passed with ten switch/rollback pairs and six committed redirects. Candidate lint, 66 unit, and 96 browser checks passed on the final candidate assets; backend Java is unchanged from the 131-test checkpoint. Six flags are enabled and four gated. The candidate Beacon panel now stays inside the 1280px viewport; its wide inventory table scrolls within the panel, and the layout has a browser regression.

Prior local image: `indooro-admin-rebuild:beacon-sort-candidate` (`sha256:d0dcf1b80974814eeabfa7fe8cacc93a95902d4c65cd3152884f5f6194d0c271`), runner SHA-256 `e7003ef6e069af3e8456b84b55b4afe4efb3ed8e4d009a9bcb126d25f24f2c6a`. The previous complete Store-detail image is stopped as `indooro-admin-image-smoke-prev-beacon-sort`. The gated Beacon candidate adds Code/UUID/Store sorting and suppresses stale mutation controls on a failed inventory reload. Candidate lint, 66 unit and 96 browser cases, full `test:live`, `test:live:stores`, and `test:live:cutover` passed. Five route flags are enabled; Beacon remains gated.

Prior local image: `indooro-admin-rebuild:store-detail-cutover` (`sha256:a343f7fbf64ef4b6f3d61806134001fcaf14e6a2547b0cb1d48def606e7163a7`), runner SHA-256 `e653bcab3bddf32be4c57ce63d000570dee4682a989b58c07a8223542f142be5`. The previous complete image is stopped as `indooro-admin-image-smoke-prev-store-detail`. `test:live:stores` now covers both list and detail legacy/candidate actions, including archived and active Layout states, three role scopes, keyboard, detail 503/retry, Beacon lifecycle, and archive API/audit readback. The full `test:live` and `test:live:cutover` passed, with ten switch/rollback pairs and five committed redirects. Candidate lint, 66 unit and 94 browser cases passed. Five routes remain gated.

Prior local image: `indooro-admin-rebuild:editor-lock-duplicate` (`sha256:30632bf2b7eb4074e79ba2a3cce136536cb5255dbefa25f48895f6c1e3084817`), runner SHA-256 `158202cbf6df88f46aaeb54673e0cb382c30198023d700f24fb886cdf45289b6`. The Store-cutover image is stopped as `indooro-admin-image-smoke-prev-stores-cutover`. The packaged three-role workflow checked that a locked Editor shelf could not be duplicated with `Ctrl/⌘+D`; the full Store parity and ten route switch/rollback checks also passed, including four committed redirects. Candidate lint, 66 unit and 94 browser cases passed. Four routes remain enabled; Editor stays gated.

Prior local image: `indooro-admin-rebuild:stores-parity-cutover` (`sha256:965e45066a22da74ee9b613cf3c990f945a456483b909f269b4c2f0102670996`), runner SHA-256 `b9bfcba5ad939d63a7c5a53d381bca340a976f20164490cf84d8e85057e60b00`. The preceding direct-edit image is stopped as `indooro-admin-image-smoke-prev-direct-edit`. `ADMIN_SMOKE_HOST_ALIAS=1 npm run test:live:stores` now forces the legacy list only inside its browser comparison, so it also works after committed Store cutover. It captures `evidence/stores/legacy-admin.png` and `candidate-admin.png`, creates and edits through both UIs, checks server post-state, and archives its fixture Stores. The image passed that probe, the full three-role `test:live`, and `test:live:cutover` with four committed redirects and ten simulated rollback pairs. Dashboard, Regions, Stores, and Diagnostics are enabled locally.

Prior local image: `indooro-admin-rebuild:stores-sort-candidate` (`sha256:7e905f0c5058f2ed2d67f70ab8fcc47e89f8f30c1cd6fe96d669e789789a61ed`), runner SHA-256 `d65703b8972591843623c4d1202f9f1721069a76484adcc28711adfb971f45a4`. The prior canvas image is stopped as `indooro-admin-image-smoke-prev-canvas`. From `admin-ui/`, `ADMIN_SMOKE_HOST_ALIAS=1 npm run test:live:stores` runs the disposable two-Store legacy/candidate list comparison with three authenticated roles and archives its fixture Stores. The new image also passed the full `test:live` workflow and `test:live:cutover` (ten switch/rollback pairs, three committed redirects). The Store route flag remains false.

Prior local image: `indooro-admin-rebuild:editor-canvas-group` (`sha256:50f1832bc1949ed9c8f9dba1342a3bd29c5ca335c2da0d496048558ad804e963`), runner SHA-256 `30c318b20464a3bfce9039f9b9a553d94e0ed6dd78eec10fbaac856a425701d6`. The Editor canvas has a named interactive group role and keyboard description. Freshly packaged candidate browser tests passed 93/93, and the local image passed `test:live` and `test:live:cutover`. Its previous Regions image is stopped as `indooro-admin-image-smoke-prev-regions` for rollback. Three route flags are enabled locally.

Latest local image for Regions parity: `indooro-admin-rebuild:regions-parity-final` (`sha256:45abaa98d29154177883b96ffbe854653be4b483124209d5eb11d006c52b0cf6`), runner SHA-256 `34afc67d7a31f55a2b3cb012aa0018ddebcb2f693554b201425d907e3b695896`. Regions passed its dedicated packaged legacy/candidate three-role probe, committed redirect, ten rollback pairs, and 93 candidate browser checks. The prior `editor-routing-bulk-final` image is stopped as `indooro-admin-image-smoke-prev-bulk-final` for local rollback.

For a repeatable iOS Simulator map fixture, run `ADMIN_SMOKE_HOST_ALIAS=1 npm run seed:live:ios-map` from `admin-ui/` on the disposable stack. It prints a new Store ID, Store name, and two unique product names. The Store has map coordinates and an active layout with shelves `3100/1` and `310/1`; the products target `310/1` and unmapped `310/2`. Build the final Swift app's Debug Simulator scheme, boot a simulator, install it, and launch with `SIMCTL_CHILD_INDOORO_API_BASE_URL=http://127.0.0.1:8080/api xcrun simctl launch <device-id> at.ac.htl.leonding.indooroswift2`. Select the new `AAA iOS Editor` Store in Karte, search the printed route product, then search the missing-target product. `npm run test:swift-endpoint` checks that only Debug accepts a valid `/api` override; Release keeps the configured endpoint. The run recorded the correct target shelf and stale-target removal in [`evidence/ios/`](evidence/ios/). Simulator input does not prove physical beacon positioning.

Latest packaged image on 2026-10-14: `indooro-admin-rebuild:editor-routing-bulk-final` (`sha256:d7a6d2f635bf4a16579207090e3054ded9abccf823bfb3990caf5e361f267593`). The full local live workflow passed with direct Store/global publication denial for contradictory shelf sections without layout codes, public version preservation, a published `3100/1` prefix collision checked through customer search for category `310`, and accessible Editor canvas help. Ten route switch/rollback pairs passed. Store `b223b3f8-696d-4e8a-979b-043eac60fa5d` passed the actual Swift layout decoder and both compiled shelf-routing probes. `test:live:catalog` confirmed two saved categories and two saved products through ordered row results and anonymous GET readback; duplicate input was rejected before writing. Partial failure, transport ambiguity, and overwrite policy remain open, so import commit stays disabled. The preceding combined image `sha256:afdd55f95e6784c79dc648abacd41c3951b4b8b0dea70aa1287060a80ab63a39` is retained as rollback target.

On 2026-10-14, `npm run test:swift-routing -- 4f700c08-b9eb-4ae4-a6f3-2b1f606663f6` fetched the anonymous active Store layout from the running packaged image and compiled both Swift model variants. Each resolved its published `310/1` shelf and a separate `31` versus `310` collision fixture by exact category and section. Both iOS Simulator schemes built with code signing disabled. The Quarkus image itself was unchanged, and no iOS device navigation was observed.

The prior 2026-10-14 packaged image was `indooro-admin-rebuild:editor-semantic-layers` (`sha256:a06a843f744039991161de4811c5ebc7658fdf1b8cdce46279341500b20e2621`). It passed the full local live workflow, the layer button-role assertion, and ten route switch/rollback pairs. See `RELEASE_EVIDENCE.md` for the artifact sequence.

Run this only on a disposable local database. The smoke check creates regions, stores, layouts, and scope assignments.

## Start

From the repository root:

```bash
docker run --name indooro-admin-rebuild-pg \
  -e POSTGRES_USER=indooro -e POSTGRES_PASSWORD=indooro -e POSTGRES_DB=indooro \
  -p 127.0.0.1:55433:5432 -d postgres:17
docker compose -p indooro-admin-rebuild up -d keycloak opensearch
cd backend/indooro_server
DB_PORT=55433 sh ./mvnw quarkus:dev
```

If the named PostgreSQL container already exists, use `docker start indooro-admin-rebuild-pg`. Wait for the Keycloak discovery URL at `http://localhost:8180/realms/indooro/.well-known/openid-configuration` and OpenSearch at `http://localhost:9200/` to return 200 before testing. The Quarkus dev server listens at `http://localhost:8080`.

In another terminal:

```bash
cd admin-ui
npm ci
npm run package:candidate
npm run verify:candidate
npm run test:live
npm run test:live:cutover
```

`test:live` reads the local demo account credentials from `keycloak/realm/indooro-realm.json`; it does not print them. It initializes an empty product index through the protected admin operation and accepts the expected 409 conflict on later runs. It inserts local scope assignments because migration V5 only seeds those when named demo region/store records already exist. It tests both candidate editor modes through the browser, checks draft isolation against the anonymous mobile endpoint, verifies global publication and history through OpenSearch, checks six anonymous store/catalog/recipe contracts including a recipe draft → publish → deactivate lifecycle, and checks concurrent saves and activations against PostgreSQL. It does not clean up the created records or global layout versions, so use dedicated local PostgreSQL and OpenSearch data only.

`test:live:cutover` authenticates and exercises each of the ten current-route switches and their rollback by intercepting the served map; it does not alter the committed flags. On 2026-10-12 it passed all ten switch/rollback pairs with query parameters and URL fragments preserved. The later `test:live` run also passed in-scope store updates for both manager roles, a region-manager store creation, and denial of foreign store updates/layout saves and store-manager creation.

The 2026-10-13 keyboard/recipe recovery image passed the full `test:live` workflow and ten route switch/rollback pairs. The recipe portion now creates a tag, changes the candidate recipe's tag in the UI, verifies its admin and anonymous published representations, then deactivates and archives it in the UI. The archive stays absent from anonymous mobile reads. The packaged run also injected a failed recipe step save before publication and a failed status transition after the revised step saved, verified draft privacy and server state after each, restored input, and retried publication. In the Store-Manager editor, Space selected a focused layer button, arrow keys on that button left geometry unchanged, and canvas arrow keys still moved the selected shelf.

After `test:live` prints a Store ID, `npm run test:swift-layout -- <store-id>` fetches its anonymous current-layout response and compiles the actual `LayoutData.swift` and `MobileStoreModels.swift` with `swiftc` to decode `MobileLayoutResponse`. This requires Xcode command-line tools. The 2026-10-13 local run decoded a published three-element layout with numeric IDs. It tests the Swift data contract on macOS; an iOS device rendering journey remains open.

The later shelf-target-guard image passed the full live workflow and ten route switch/rollback pairs. The live script first entered a mismatched shelf `layoutCode` in the Editor and saw a blocking validation error, then corrected and published it. Direct Store immediate publication, saved-draft activation, and global publication with a mismatched category/section returned HTTP 400. Anonymous current layouts kept their prior IDs. The published Store response decoded through the actual Swift models.

## Observed 2026-10-12

- Keycloak 26.2 required complete first and last names for imported demo users. Those fields are now in the local realm JSON.
- Quarkus 3.6 with a hybrid OIDC app read roles from the ID token by default, while Keycloak's default roles scope put them in the access token. `quarkus.oidc.roles.source=accesstoken` and `keep-all-tokens` made all three logins work with server-side role checks.
- A live first draft remained invisible to anonymous mobile reads until publication. A browser edit saved a new draft and kept the old mobile layout active until confirmation.
- The editor preview can switch between that saved, unpublished draft and the actual public response. It names unresolved beacon/product-position findings and states when mobile routing has not been verified. Publication confirmation reports remaining warnings.
- Four parallel draft saves received distinct version numbers. Two parallel activations exposed a Hibernate flush-order problem against the `uk_store_active_layout` partial unique index. Flushing the archived row before activating the replacement fixed the failure; the repeat returned 200 for both activations and PostgreSQL contained exactly one active version.
- The candidate global editor loaded the 55-element bundled layout, published a changed shop name after confirmation, and anonymous `GET /api/layout/current` immediately returned the change. History and version retrieval returned the published ID.
- A fresh OpenSearch instance without a `products` index returned 500 for public product and recipe reads. The smoke script now initializes the index through `POST /api/admin/index/create`; anonymous reads then return the expected empty collections. That index create/delete API had no role guard; both mutations now require admin role and active access assignment. Region/store-manager denial was checked live.
- The recipe lifecycle stayed invisible to anonymous mobile reads while DRAFT, became readable with its ingredient and step after publication, and disappeared after deactivation. The final `npm run test:live` run passed with 12 candidate deep links and refreshes, two scoped-role denial checks, six anonymous contract checks, both editor modes, four parallel saves, two parallel activations, and one active version.
- The anonymous iOS/customer contract check now creates a product through the protected Admin API, waits for that exact item in public search, and checks its `id`, `name`, `price`, and `layoutCode`. It also checks a newly created store's required Swift fields and the published mobile layout envelope, grid size, and numeric element fields after activation. This verifies response shapes against the current Swift models and customer API use; it is not an iOS device run.
- Docker Desktop later exhausted host disk space during an extended run and PostgreSQL reported a WAL write error. The prior live run was green. Restarting the local Docker application, pruning 2.147 GB of unused build cache, and restarting only the dedicated acceptance containers restored PostgreSQL through automatic recovery; the extended `test:live` run then passed. Check free disk space before repeating local acceptance.
- The current packaged image described in `RELEASE_EVIDENCE.md` ran in Quarkus `prod` profile against the dedicated stack. Authenticated cutover/rollback and the full `test:live` workflow passed again from that image, including manager API/scope checks and 15 denied candidate direct links. The candidate UI updated a product and created/edited a category; anonymous catalog reads confirmed the changes. The live store editor persisted layout code, product position, and access angle through publication to the public mobile layout. Its Keycloak redirect was tested on local port 8080 with a Chromium host alias for `host.docker.internal`.

The run uses a local development stack. Production deployment, iOS device testing, and migration of the current `/admin/*` routes require separate acceptance evidence.

The external `test:live` script was extended without changing the packaged image. Its latest run passed candidate UI region create/edit/archive, beacon create/edit/assign/release/archive, region-manager store create and detail navigation, store-manager store-detail edit, product create/edit/delete, and recipe edit/publish/deactivate, including persisted API and public post-state checks. The output reports `candidateRegionLifecycle`, `candidateBeaconLifecycle`, `candidateStoreCreate`, `candidateStoreDetailEdit`, `candidateProductLifecycle`, and `candidateRecipeLifecycle` as `true`.

The same run moved a selected shelf with the keyboard in the live store editor, undid and redid the move, saved the draft, and published it. The anonymous active layout returned the final shelf `x` value.
After concurrent activations, the script restored that previous store-layout version and confirmed the anonymous response and unique active-version count; the output reports `layoutVersionRecovery: true`.

The candidate diagnostics route also loaded admin audit/error logs from the packaged server and refreshed with the keyboard; the output reports `candidateDiagnosticsReadRefresh: true`.

An expanded role run found that foreign-store detail/editor API calls returned 403, but the candidate pages rendered a generic loading error. Both pages now render an explicit access-denied state without retry. The rebuilt image passed all 15 denied direct links, the full live script, and the ten route switch/rollback checks.

The live script also compares four manager dashboard metrics with each role's scoped API responses and verifies that admin-only activity is absent; its output reports `candidateScopedDashboard: true`.

The live store editor also exports and reimports JSON with a navigation metadata marker. The marker survived draft save, publication, anonymous current-layout retrieval, and version recovery against the same packaged image; the output reports `layoutJsonRoundTrip: true`.

The candidate recipe UI created a draft using a real catalog product, ingredient quantity, and step, then published it; the anonymous recipe endpoint returned it. The output reports `candidateRecipeCreatePublish: true`.

The candidate beacon UI reviewed and committed two rows sharing one UUID with distinct minors. API reads confirmed both records; the output reports `candidateBeaconBulkCreate: true`.

The candidate store-detail page archived the store created through the region-manager form; the API confirmed `ARCHIVED` and the anonymous store list omitted it. The output reports `candidateStoreArchive: true`.

Before that archive, the region manager assigned and released a free beacon through the candidate Store detail page; the store-beacon API confirmed both states. The output reports `candidateDetailBeaconLifecycle: true`.

After archive, the candidate detail page showed the server's archive audit entry and the store audit endpoint returned the `ARCHIVE` action.

The next packaged image includes paged beacon target stores and `currentStore.regionId`. A browser regression assigned to store 101 and the live scoped API returned its region ID. The grown OpenSearch index exposed a global layout history bug: unsorted hits were truncated before local sorting. The fixed backend filters versions and sorts by saved time in OpenSearch; the just-published version appeared immediately in the next live run. Both live scripts passed again.

## Evidence boundary (2026-10-12)

| Area | Observed in the local run | Still not established |
| --- | --- | --- |
| Frontend / Quarkus | Candidate package built and verified; 12 authenticated candidate deep links refreshed; ten route flags switched and rolled back in an intercepted live map. | Current `/admin/*` release cutover and every route's action/state parity. |
| Backend / authorization | Real demo-role sessions; region/store scoped writes and foreign-scope denials; store/global layout and recipe workflows; concurrent layout writes. | Production identity configuration and the full API role matrix. |
| PostgreSQL | Schema-backed store/layout persistence; concurrent version numbering and one-active-version constraint. | Production database state or migration/restore behavior. |
| Keycloak | Demo admin, region-manager, and store-manager logins work with the local realm. | Production realm/client behavior. |
| OpenSearch | Global publication/history; protected index initialization; anonymous product/catalog reads after initialization. | Production index readiness and recovery. |
| Public mobile/customer | Anonymous store, catalog, recipe, global-layout, and current store-layout response fields checked after mutations. | iOS device journey, full customer journey, and mobile route reachability. |

These are runtime observations, not substitutes for the proposal/spec acceptance gates. The initial static baseline remains the separate pre-change record in [`BASELINE.md`](BASELINE.md).
