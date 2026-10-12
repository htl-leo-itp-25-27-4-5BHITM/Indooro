## 1. Baseline And Change Coordination

- [ ] 1.1 Verify this proposal, delta specs, and design against a running local stack; record corrections before implementation.
- [ ] 1.2 Inventory every current admin route, user action, API call, role, scope, and page state with reproducible fixtures and screenshots.
- [ ] 1.3 Record current backend, frontend, database, Keycloak, OpenSearch, and public mobile/customer smoke results, separating observed behavior from specifications.
- [ ] 1.4 Map each `fix-admin-dashboard-contract-drift` UI task to an old-route fix or replacement-route acceptance test; preserve its backend/API tasks and obtain coordinated task updates before closing any overlap.
- [ ] 1.5 Map `establish-shared-api-contract` JSDoc/type-generation tasks to the new TypeScript client while preserving reviewed-schema parity and CI ownership; record coordinated changes before closing them.
- [x] 1.6 Confirm `protect-legacy-write-endpoints` route protection and `harden-platform-security-baseline` CSP/encoding acceptance before switching new frontend routes.

## 2. Frontend Build And Security Foundation

- [x] 2.1 Create a pinned React/Vite/TypeScript admin source workspace with typecheck, lint, unit-test, and build scripts.
- [x] 2.2 Configure reproducible build output inside Quarkus static resources and verify packaged `/admin/*` direct links and refreshes.
- [ ] 2.3 Implement a route cutover map that keeps existing static pages active until their parity gate passes and permits route-level rollback.
- [x] 2.4 Implement a typed same-origin API client with one response-body read, 401/403 handling, validation/conflict messages, cancellation, and request-state tests.
- [x] 2.5 Implement `/api/admin/me` bootstrap, role/scope-aware navigation, logout to `/admin/logout`, and direct-link access-denied states.
- [ ] 2.6 Add design tokens and accessible shell, form, table, dialog, notification, loading, empty, and error components with keyboard and contrast checks.
- [x] 2.7 Verify the new frontend has no runtime CDN dependency, uses safe text rendering, and runs under the CSP specified by `harden-platform-security-baseline`.

## 3. Core Staff Routes

- [x] 3.1 Rebuild dashboard with scoped counts, setup warnings, recent activity, and actionable links; pass admin, region-manager, and store-manager route tests.
- [x] 3.2 Rebuild region list/detail/create/edit/archive workflows and verify scope, validation, confirmation, and post-action state.
- [x] 3.3 Rebuild store list with server-backed query state, paging, filters, layout status, and direct store-detail links.
- [x] 3.4 Rebuild guided store create/edit and detail sections for metadata, beacon assignments, layout versions, and audit history.
- [x] 3.5 Rebuild beacon inventory, bulk parse/review, create/edit, assignment, release, and archive workflows with identity validation.
- [x] 3.6 Rebuild product list/create/edit/delete, readiness, and category context; verify documented `310/1/1/1` layout-code behavior and backend paging.
- [x] 3.7 Rebuild recipe list/detail/edit, tags, ingredients, steps, mapping, preview, and publication controls; pass a seeded-recipe no-data-loss test.
- [x] 3.8 Rebuild admin-only diagnostics within the shell and verify scoped staff cannot see logs or trigger their APIs.
- [x] 3.9 Review current catalog bulk APIs; implement parse/review/commit/summary only for supported behavior and document any blocked transaction/preview gap before enabling it.
- [ ] 3.10 For each migrated route, record direct-link, role/scope, keyboard, empty/error, existing-action parity, and rollback evidence before switching its entry.

## 4. Layout Editor And Backend Workflow Gaps

- [x] 4.1 Capture representative store and legacy layout JSON fixtures, assigned-beacon cases, routing targets, and mobile current-layout responses.
- [x] 4.2 Implement pure editor state and command functions for create, move, resize, rotate, delete, inspector changes, selection, undo, and redo with fixture-based tests.
- [x] 4.3 Implement editor workspace, element library/list, toolbar modes, canvas zoom/pan/grid/snap, inspector, status, and unsaved-change warning.
- [x] 4.4 Implement store-context beacon selection and duplicate/unassigned placement feedback; keep legacy/global mode visibly distinct and protected.
- [x] 4.5 Implement element-linked validation for bounds, overlap, entrance, beacon, shelf metadata, and routing readiness with blocking versus warning outcomes.
- [x] 4.6 Verify first-draft behavior in `StoreLayoutAdminService`; make an inactive first version possible without changing the public no-active-layout response, if runtime evidence confirms the gap.
- [x] 4.7 Implement separate draft save, publish/activate confirmation, version history, and mobile preview; preserve layout JSON fields and one-active-version invariant.
- [x] 4.8 Coordinate concurrent layout save/activate tests and row-locking implementation with `optimize-backend-data-access` before marking publication conflict-safe.
- [x] 4.9 Add editor unit, interaction, persistence, and public mobile compatibility tests for store and legacy modes.

## 5. Contracts, Documentation, And Release

- [ ] 5.1 Add every rebuild-owned HTTP change to reviewed `openspec/specs/shared-api/openapi.yaml` with operation, auth, payload, error, and consumer coverage.
- [ ] 5.2 Verify iOS/customer anonymous catalog, store, and current-layout contract fixtures after admin mutation and editor publication changes.
- [ ] 5.3 Run frontend typecheck/lint/unit/component tests, route Playwright tests, backend tests, API role matrix, package smoke tests, and `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 5.4 Perform complete workflows on a running stack as admin, region manager, and store manager, including denial of out-of-scope direct links and mutations.
- [ ] 5.5 Update admin developer, operations, migration, rollback, and user documentation with actual commands, screenshots, route map, and known limits.
- [ ] 5.6 Verify a production build and immutable image artifact; record image tag, manifests, secrets, health checks, and public/protected smoke commands before any authorized LeoCloud rollout.
- [ ] 5.7 After implementation evidence satisfies every requirement and scenario, mark task boxes accurately, run OpenSpec verification, and archive this change through the normal workflow.
