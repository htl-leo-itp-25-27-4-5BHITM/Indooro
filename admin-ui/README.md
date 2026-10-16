# Indooro Admin UI source workspace

This is the source for the staged React/Vite/TypeScript Admin Platform rebuild. The candidate is packaged at `/admin/next/` inside Quarkus static resources and does not replace any current `/admin/*` route. Route cutover remains a separate OpenSpec task.

Use the pinned Node 22.23.3 runtime (or a compatible Node 24 release) and run:

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

`dist/` stays local to this workspace. `package:candidate` copies the build only to Quarkus resources at `admin/next/`, including static entries for the implemented nested candidate routes. The command never replaces the current `/admin/` pages. `test:browser` uses a file-only static server to verify direct navigation and refresh; Quarkus packaging and OIDC behavior still require a running-stack check before OpenSpec task 2.2 can be closed.

With the dedicated local stack running, `npm run test:live` verifies real Keycloak login for all three staff roles, region/store scope denial, Store Editor draft and publish behavior, anonymous mobile current-layout reads, concurrent version saves, and the one-active-version database invariant. It creates disposable local records and updates the demo users' local scope assignments. See [live stack setup](../docs/admin-rebuild/LIVE_STACK.md).

The API client is in `src/api/client.ts`; it accepts only same-origin `/api/*` paths and sends session cookies with `credentials: "same-origin"`.

The candidate loads `/api/admin/me` and provides a scoped dashboard; region, store, beacon, product, category, and recipe workflows; diagnostics for admins; and a store layout editor with draft save, version history, and explicit activation. These pages are staged under `/admin/next/`. Browser tests mock API responses; `test:live` exercises the core workflow against PostgreSQL, OpenSearch, Keycloak, and Quarkus. No existing route is cut over until its OpenSpec parity gate passes.
