# Indooro Admin UI source workspace

This is the source for the staged React/Vite/TypeScript Admin Platform rebuild. The candidate is packaged at `/admin/next/` inside Quarkus static resources and does not replace any current `/admin/*` route. Live Quarkus/OIDC verification and route cutover are separate OpenSpec tasks.

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

`dist/` stays local to this workspace. `package:candidate` copies the build only to Quarkus resources at `admin/next/`, including static entries for `/admin/next/stores/`, `/admin/next/stores/detail/`, and `/admin/next/editor/`. The command never replaces the current `/admin/` pages. `test:browser` uses a file-only static server to verify direct navigation and refresh; Quarkus packaging and OIDC behavior still require a running-stack check before OpenSpec task 2.2 can be closed.

The API client is in `src/api/client.ts`; it accepts only same-origin `/api/*` paths and sends session cookies with `credentials: "same-origin"`.

The candidate loads `/api/admin/me` and provides a scoped dashboard, paged store list, and a store layout editor with draft save, version history, and explicit activation. Store detail and other management routes still link to the current staff UI. Browser tests mock API responses; they do not prove the live Keycloak role and store-scope matrix. No existing route is cut over until its OpenSpec parity gate passes.
