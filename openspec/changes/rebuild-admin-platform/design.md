## Context

The current Admin Platform is a static multi-page surface served by Quarkus from `META-INF/resources/admin`. The URLs are protected, but multiple entries load the same broad `app.js`, and the editor is a separate DOM-driven canvas application. The permanent `admin-dashboard` spec requires this build-free form, while archived `2026-09-21-redesign-admin-platform-layout-editor` merged a more capable product target into `admin-platform-management` and `store-layout-management`. That archived change's task checkboxes claim implementation, yet its own design says it was planning-only and the checkout contains no admin React/Vite workspace. The task boxes are not implementation evidence.

The backend is a Quarkus modular monolith with PostgreSQL/Flyway operational records, OpenSearch catalog records, Keycloak/OIDC web login, and database-backed region/store assignments. Existing iOS and customer web clients read public store, catalog, and layout routes. Admin REST routes, Keycloak sessions, current roles, scope checks, and layout JSON are integration constraints. `docs/admin-rebuild/OPENSPEC_AUDIT.md` records every active change and its ownership.

## Goals / Non-Goals

**Goals:** Deliver a maintainable, typed Admin Platform and editor; preserve existing staff capabilities and deep links; correct proven data-loss and security defects through their owning changes; make draft/publication and catalog review trustworthy; preserve mobile/customer contracts; make each migration step testable and reversible.

**Non-Goals:** Replace Quarkus, PostgreSQL, OpenSearch, Keycloak, or the three existing roles; introduce server-side customer tracking, live inventory, analytics, multi-floor routing, or Android features; silently archive other active changes; treat the archived redesign's checked tasks as evidence of runtime completion.

## Decisions

### 1. Typed SPA target with a staged route migration

The target frontend uses React, Vite, and TypeScript, builds to static assets, and is served by Quarkus under `/admin/*`. Start with a shared shell, typed same-origin API client, route-local data loading, accessible primitives, and a single route registry. Keep the existing static pages available while routes move individually. Preserve `/admin/`, `/admin/regions/`, `/admin/stores/`, `/admin/stores/detail/?storeId=...`, `/admin/beacons/`, `/admin/products/`, `/admin/categories/`, `/admin/recipes/`, `/admin/server-logs/`, and `/admin/editor/` as direct links. Verify Quarkus fallback and OIDC protection with both unauthenticated and scoped sessions before switching a route.

This matches the archived redesign recommendation and addresses the current single-script/duplicated-page coupling. A permanent static-only extension would minimize build setup but leave the editor's command history and page-level state difficult to maintain. A full immediate cutover would make it harder to isolate parity failures. The `admin-dashboard` delta changes its build-free rule while retaining the existing frontend for routes not yet switched. The unchanged `admin-dashboard` requirements, including role-aware nav and smoke behavior, still apply.

### 2. Backend remains the authorization boundary

The SPA uses same-origin session cookies and `/api/admin/me` for identity, role, and assigned scope. It hides actions outside the role for usability, but backend `@RolesAllowed` plus `AdminAccessService` decide access. The Keycloak realm/client, Quarkus OIDC hybrid web-app flow, `/admin/logout`, and user assignment mapping by stable `sub` remain the current model. No new realm, client, role, or database scope strategy is introduced by this change. Protected `/admin/*`, `/api/admin/*`, `/api/regions*`, `/api/stores*`, and `/api/beacons*` remain protected; anonymous mobile/customer GET routes remain public under the method boundary established by `protect-legacy-write-endpoints`. Direct-link and API tests cover 401, 403, and in-scope success.

Alternative: client-only route guards. Rejected because they cannot enforce data access. Any CSP and output-encoding behavior lands through `harden-platform-security-baseline`; the new frontend must conform before its route is released.

### 3. Existing changes keep ownership of their planned fixes

| Concern | Existing owner | Rebuild action |
| --- | --- | --- |
| Legacy layout, catalog, PDF, index write protection | `protect-legacy-write-endpoints` | Depend on its route matrix; do not redefine access. |
| Keycloak production setup, CSP, XSS, input bounds, audit actor, infrastructure | `harden-platform-security-baseline` | Ensure new rendering/build works under its policy; reuse server validators. |
| Recipe edit loss, logout, list paging, readiness, errors, dialog access | `fix-admin-dashboard-contract-drift` | Keep backend/API tasks and tests; map static UI tasks to replacement routes and record each rebase explicitly. |
| List query budgets, layout row locking, parameter bounds | `optimize-backend-data-access` | Consume optimized APIs and coordinate concurrent publication tests. |
| Versioned API, reviewed schema, generated types, error envelope | `establish-shared-api-contract` | Generate TypeScript types for the new client from its reviewed schema; rebase old `core.js`/`app.js` JSDoc tasks rather than dropping contract checks. |

If a fix lands first in the current static UI, preserve it until the corresponding SPA route passes the same regression test. If the SPA route lands first, implement the behavior there and update the owning active change's task plan through a separate coordinated edit. The rebuild task list records the dependency, but does not mark another change complete.

### 4. Page workflows use authoritative server state

Use a typed API layer and route-local query state for paging, search, filters, loading, errors, and invalidation. Mutations complete only on a confirmed response, and the UI reloads the affected record/list after success. Recipe editing fetches complete detail, keeps scalar fields and tags intact, and calls ingredient/step operations with explicit stage errors until an atomic API is designed. Product and category import starts with local parsing and a review screen, but only claims commit outcomes that the protected backend can report. Unsupported preview/transaction semantics are blocked in the UI and captured as an explicit API gap before implementation.

Alternative: optimistic updates for all workflows. Rejected because current APIs include scoped mutations, version transitions, and possible partial multi-request recipe updates. Optimism may be added only for individually reversible fields with proven conflict behavior.

### 5. Editor state separates commands, validation, drafts, and publication

The editor uses a normalized in-memory layout model plus pure command functions for create, move, resize, rotate, delete, inspector changes, and undo/redo. Rendering can use Konva/react-konva if fixture-based geometry and hit-testing checks support it; the persistent JSON stays compatible with current consumers. Store mode loads assigned beacons and layout versions. Legacy/global mode stays visibly separate and remains admin-only after `protect-legacy-write-endpoints`.

Validation returns element-linked blocking errors and warnings. Save creates an inactive draft; publish/activate is a separate confirmed action that checks validation and updates one active version. Current `StoreLayoutAdminService.saveLayoutVersion` auto-activates the first version even when `activate=false`. Change that behavior only with a regression test of first-draft, fallback, publication, and existing mobile reads. `optimize-backend-data-access` owns row locking; the rebuild owns the workflow semantics. Schema migration is not expected for baseline draft/publish because `LayoutVersionStatus.DRAFT` and activation endpoints already exist; verify against schema and actual runtime before ruling it out.

Implementation decision (2026-10-11): explicit `activate=false` saves a first DRAFT. `activate=true` activates. Omitted or `null` retains historical first-save activation for existing API clients. The reviewed shared OpenAPI description records this compatibility behavior; `establish-shared-api-contract` still owns global schema export and type generation. The no-active anonymous mobile fallback is unchanged and covered by a service regression test.

Alternative: maintain editor state directly in DOM/canvas objects. Rejected because it makes undo, validation, autosave state, and fixture testing fragile. Undo history is session-local unless a later change specifies persistent drafts beyond saved layout versions.

### 6. Contracts, deployment, and rollback

Any changed endpoint is reviewed in `openspec/specs/shared-api/openapi.yaml`, with status, error envelope, access class, and consumers verified before route cutover. Add fixture compatibility checks for store layout JSON and public current-layout responses used by iOS/customer web. Prefer additive API responses and existing endpoints. Breaking behavior requires the versioning process from `establish-shared-api-contract`.

Vite output is copied into Quarkus static resources by a reproducible build step. CI runs TypeScript checks, frontend unit/component tests, route smoke tests, backend tests for changed services, OpenSpec validation, and packaging checks. The existing image/LeoCloud manifests remain the deployment path. The implementation must pin the built asset revision, list image tag/manifests/secrets for any rollout, and verify unauthenticated/protected route behavior after deploy. A route switch can be reverted to the prior static entry; backend changes need compatible roll-forward/rollback handling, especially if an API or migration is added. No live rollout is implied by creating this change.

## Risks / Trade-offs

- [Static and SPA assets share `/admin/*` during migration] → Use an explicit route cutover map and package-level direct-link tests; keep the old entry for uncut routes.
- [Stale active changes target `app.js` or JSDoc] → Rebase tasks deliberately with each route, preserve their backend fixes and tests, and record ownership changes in both artifacts before closing them.
- [First draft behavior affects fallback mobile reads] → Test stores with zero, one, and multiple layout versions against anonymous current-layout routes.
- [Multi-request recipe edits can partially persist] → Show the failing stage and reload authoritative detail; add an atomic backend operation only under a reviewed API delta.
- [Frontend build increases release complexity] → Pin dependencies, package assets through Quarkus, and verify direct links and CSP in the same image.
- [Archived task checkboxes overstate completeness] → Use observable behavior, tests, and runtime checks as completion evidence.

## Migration Plan

1. Capture baseline route, API, role, and layout fixtures. Run security prerequisites and preserve current static admin assets.
2. Establish the new source/build path and protected route fallback without changing user-visible routes. Verify local and packaged 401/403/in-scope behavior.
3. Migrate shell and admin routes in small groups, with parity and rollback evidence for each. Reconcile the active dashboard and shared-API tasks before removing old page code.
4. Rebuild the editor on fixture-tested state and command logic; verify legacy mode, store mode, draft/publish, concurrency, and mobile layout compatibility.
5. Run all backend, frontend, contract, role/scope, accessibility, and OpenSpec checks; test the complete workflows on a running stack. Update task status only after evidence is recorded.
6. For any authorized deployment, publish an immutable image, perform public/protected smoke checks, and keep the previous image and route map ready for rollback.

## Open Questions

- Whether a safe product/category import preview and commit can be guaranteed by current bulk APIs; verify before enabling the reviewed import UI.
- Whether `react-konva` passes required editor geometry, accessibility, and bundle tests; choose a simpler canvas layer if it does not.
- Whether Quarkus static routing needs a protected fallback handler or generated directory entries for every preserved deep link; settle with a packaged integration test before route migration.
