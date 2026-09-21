## Why

Three clients consume the backend, but the contract exists only as hand-written models: 14 Swift model files, untyped JavaScript in the Admin UI, and ad-hoc JSON in the customer page. The audit found ten Swift contract defects (C1–C10), eight Admin UI contract defects, and a broken customer highlight feature (`docs/audit/CODE_AUDIT.md` §3). `quarkus-smallrye-openapi` is installed but its output is neither versioned nor checked, legacy routes use three different error formats (API-21), two product write paths coexist (API-20), and there is no versioning or deprecation policy (API-27). The reviewed contract `openspec/specs/shared-api/openapi.yaml` now exists; this change makes it enforceable and uses it to generate types.

## What Changes

- Annotate resources so that the generated `/q/openapi` document contains operation ids, tags, schemas, and security requirements, and add a CI job that fails when the generated document and `openspec/specs/shared-api/openapi.yaml` differ in paths, operations, parameters, or schemas, and when a change is breaking without a version bump.
- Lint the contract (OpenAPI 3.1 validity, operation ids, `x-indooro-access` on every operation).
- Introduce URI versioning: every route is also served under `/api/v1/…`; clients migrate to the versioned prefix; breaking changes require `/api/v2/…`; unversioned paths remain aliases of v1 until the minimum supported iOS build uses `/api/v1`.
- Add `Deprecation` and `Sunset` headers for `POST /api/mobile/upsell/suggestions`, `POST /api/products`, `POST /api/products/bulk`, and the legacy layout write, and document replacements.
- Return `ApiErrorResponse` from all legacy catalog, layout, maintenance, and utility routes.
- Derive the filtered iOS contract `api/openapi/indooro-mobile.yaml` from the reviewed contract (input for the Swift type generation in `modernize-ios-client-architecture`), and generate TypeScript declarations for the Admin UI with `openapi-typescript`, type-checked through JSDoc and `tsc --noEmit` without introducing a bundler.
- Run contract tests: httpYac suites and Playwright mocks validate responses against the schema.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `shared-api`: generated-versus-reviewed contract parity, breaking-change control, URI versioning, deprecation signalling, unified legacy errors, typed client generation, response validation in tests.
- `deployment-operations`: CI contract job.

## Impact

- Backend: MicroProfile OpenAPI annotations on all resources, `mp.openapi.extensions.smallrye.operationIdStrategy`, a JAX-RS request filter for `/api/v1` aliasing (or `@Path` prefix via `quarkus.rest.path` plus compatibility routes), deprecation response filter, legacy resource error refactoring.
- iOS: `api/openapi/indooro-mobile.yaml` becomes a derived artifact of the reviewed contract; `IndooroNetworking` (from `modernize-ios-client-architecture`) switches its base path to `/api/v1`.
- Admin UI: `admin/types/api.d.ts` (generated), `// @ts-check` in `core.js` and `app.js`, `npm run admin:typecheck` runs `tsc --noEmit`.
- Tooling: dev dependencies `openapi-typescript`, `typescript`, `@redocly/cli`; `oasdiff` in CI; the Swift generator plugin is owned by `modernize-ios-client-architecture`.
- CI: new workflow job `contract` (see `deployment-operations`).
- Auth: no boundary change; versioned aliases inherit the permissions of their unversioned routes (`application.properties` paths duplicated for `/api/v1`). Protected: `/api/v1/admin/*`, `/api/v1/regions*`, `/api/v1/stores*`, `/api/v1/beacons*` plus existing. Public: `/api/v1/mobile/*` and read-only catalog/layout aliases. Roles unchanged.
- Demo proof: renaming a DTO field without updating `openapi.yaml` fails the `contract` job; `curl /api/v1/mobile/stores` equals `curl /api/mobile/stores`.
