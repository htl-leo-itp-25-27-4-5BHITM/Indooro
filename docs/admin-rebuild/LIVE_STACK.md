# Local admin acceptance stack

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
- The current packaged image described in `RELEASE_EVIDENCE.md` ran in Quarkus `prod` profile against the dedicated stack. Authenticated cutover/rollback and the full `test:live` workflow passed again from that image, including manager API/scope checks and 11 denied candidate direct links. The candidate UI updated a product and created/edited a category; anonymous catalog reads confirmed the changes. The live store editor persisted layout code, product position, and access angle through publication to the public mobile layout. Its Keycloak redirect was tested on local port 8080 with a Chromium host alias for `host.docker.internal`.

The run uses a local development stack. Production deployment, iOS device testing, and migration of the current `/admin/*` routes require separate acceptance evidence.

The external `test:live` script was extended without changing the packaged image. Its latest run passed candidate UI region create/edit/archive, beacon create/edit/assign/release/archive, store-manager store-detail edit, product create/edit/delete, and recipe edit/publish/deactivate, including persisted API and public post-state checks. The output reports `candidateRegionLifecycle`, `candidateBeaconLifecycle`, `candidateStoreDetailEdit`, `candidateProductLifecycle`, and `candidateRecipeLifecycle` as `true`.

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
