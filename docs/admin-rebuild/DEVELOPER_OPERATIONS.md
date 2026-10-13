# Admin developer and operations guide

## Local build and checks

Use Node 22.23.3 (or compatible Node 24) from the repository root:

```bash
cd admin-ui
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run package:candidate
npm run verify:candidate
npm run test:browser
```

`package:candidate` writes only to `backend/indooro_server/src/main/resources/META-INF/resources/admin/next/`. It does not replace current admin pages. `npm run test:browser` automatically builds, packages, and verifies candidate assets before Playwright, so the suite cannot accidentally run against stale files. The browser suite uses mocked APIs and static deep-link checks; it is not evidence of live OIDC or backend parity.

Legacy static admin checks from the repository root:

```bash
npm ci
npm run admin:verify
```

Backend tests from the Quarkus project:

```bash
cd backend/indooro_server
sh ./mvnw test
```

Strict OpenSpec validation from the repository root:

```bash
npx -y @fission-ai/openspec@1.3.1 validate --all --strict
```

## Disposable live stack

Use only dedicated local PostgreSQL/OpenSearch data. The acceptance script creates records and global layout versions and does not clean them up. Follow [LIVE_STACK.md](LIVE_STACK.md) for PostgreSQL 17, Keycloak/OpenSearch startup and readiness checks. Once Quarkus is running, in another terminal:

```bash
cd admin-ui
npm ci
npm run package:candidate
npm run verify:candidate
npm run test:live
```

The live check covers local demo-role login, scoped denial, candidate direct links, store draft/publication and anonymous mobile reads, global publication/history, recipe lifecycle, and concurrent version writes. It is local acceptance evidence only. It does not certify the production build, iOS device flows, or route parity for every action.

## Route operation and rollback

Candidate React pages are served at `/admin/next/*`. In the local branch, only `diagnostics` is `true`: `/admin/server-logs/` redirects to the candidate, while the other nine `/admin/*` entries retain their static pages. The map keys are `dashboard`, `regions`, `stores`, `storeDetail`, `beacons`, `products`, `categories`, `recipes`, `editor`, and `diagnostics`; editor mode still depends on `storeId`.

Before changing any route flag, complete that route's parity record in [ROUTE_INVENTORY.md](ROUTE_INVENTORY.md): authenticated direct-link and refresh, role and foreign-scope denial, keyboard/accessibility, loading/empty/error/success, action parity and resulting server state, and exercised rollback. Complete applicable live-stack and customer/mobile contract checks. Then build/package and test the exact packaged artifact. A flag change alone is not a release gate.

For a route-level rollback, set only the affected map value to `false`, rebuild/package the application, and verify the original static route and its query parameters. The legacy HTML and scripts remain in the artifact and no data migration is needed for this URL rollback. For a full application rollback, restore the previously approved immutable application artifact through the deployment system's established procedure. No production rollout or rollback has been performed or validated by this work.

## Known limits

- Route cutover is incomplete; Diagnostics alone passed its parity gate and is enabled in the local branch. Candidate route presence does not establish parity for the other nine entries.
- Candidate browser checks mock APIs. The live acceptance stack is local and uses disposable data.
- Catalog bulk commit remains disabled: product/category bulk endpoints cannot prove per-row persistence or roll back partial OpenSearch writes.
- Recipe edits span multiple API operations and may partially apply if one stage fails.
- Layout routing warnings are geometric heuristics; mobile paths have not been certified.
- Production artifact/image verification, production deployment procedures, production secrets/health checks, and iOS device acceptance remain outside the verified evidence.

