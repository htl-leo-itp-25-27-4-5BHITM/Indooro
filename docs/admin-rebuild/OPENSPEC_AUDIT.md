# Admin rebuild OpenSpec audit and decision record

Date: 2026-10-11. Baseline: isolated `origin/main` checkout at `99b802b8`; the original checkout is on a different commit and contains unrelated advertising work. The inventory below is based on `npx -y @fission-ai/openspec@1.3.1 list --json`, the active artifacts, permanent specs, and selected execution paths. Task counts describe checked boxes, not verified runtime completion.

## Active change inventory

| Change | Checked tasks | Relationship to rebuild | Coordination decision |
| --- | ---: | --- | --- |
| `protect-legacy-write-endpoints` | 0/23 | Critical auth boundary for global layout, catalog, PDF, and index writes | Implement first or in a separately verified security tranche; preserve public GET behavior. |
| `harden-platform-security-baseline` | 0/40 | XSS, CSP, layout validation, audit actor, Keycloak and deployment hardening | Apply after legacy write protection. The new frontend must comply with its CSP and text-rendering rules. |
| `fix-admin-dashboard-contract-drift` | 0/25 | Lossy recipe edits, broken logout, paging, readiness, errors, accessibility | Reuse backend/API fixes and tests; rebase old `app.js` UI tasks onto the new frontend as each route cuts over. Do not silently drop them. |
| `optimize-backend-data-access` | 0/32 | Scoped admin lists, layout concurrency, bounded parameters, index lifecycle | Keep ownership of query optimization and row locking. Coordinate layout save/publish tests and list API use. |
| `establish-shared-api-contract` | 0/20 | Versioned routes, error envelope, OpenAPI parity, generated client types | Keep contract and CI ownership. Its JSDoc-on-static-UI tasks require an explicit rebase when the TypeScript frontend cuts over. |
| `fix-ios-contract-and-spec-drift` | 1/43 | Mobile/client and selected backend contract corrections | Independent, but admin location/layout changes must preserve its mobile response contract. |
| `modernize-ios-client-architecture` | 2/64 | iOS structure and generated mobile types | Independent; its dependency on shared API versioning remains. |
| `stabilize-upsell-quality-and-request-lifecycle` | 0/135 | Upsell backend/iOS behavior | Independent except shared backend releases and security limits. |
| `indooro-motion-graphics-film` | 29/33 | Marketing film | Independent; no admin runtime dependency. |
| `indooro-premium-ad-v2` | 19/27 | Marketing film | Independent; no admin runtime dependency. |

All ten active changes have proposal, design, delta specs, and tasks artifacts. OpenSpec reports all as in progress. No active change already owns the complete admin rebuild.

## Existing durable contracts and historical trap

- `openspec/specs/admin-dashboard/spec.md` requires a build-free static ES module application and every admin page loading the same `app.js`. This conflicts with the permanent page-specific architecture and professional editor targets in `admin-platform-management` and `store-layout-management`. `rebuild-admin-platform` modifies the architecture requirement while keeping the existing frontend operational until a verified route cutover.
- `admin-platform-management`, `store-layout-management`, `catalog-maintenance-operations`, `product-catalog-search`, `admin-authentication`, `admin-role-access-control`, `domain-model`, `backend-core`, `shared-api`, and `deployment-operations` contain the relevant permanent behavior. New requirements belong in these capabilities, not duplicate new capability names.
- Archived `2026-09-21-split-admin-platform-pages` established protected `/admin/*` deep links. Archived `2026-09-21-redesign-admin-platform-layout-editor` merged extensive target UX/editor requirements into permanent specs and recommended React/Vite/TypeScript. Its design says the change was planning-only with no production code changes, but its task file marks frontend implementation and verification complete. The current checkout still serves static admin files and has no admin React/Vite workspace. Treat the archived checkboxes as unreliable evidence, retain the merged requirements, and verify their implementation anew.
- `StoreLayoutAdminService.saveLayoutVersion` currently activates the first saved version even when `activate=false`. The durable draft requirement says a draft save must not replace the active mobile layout. The first-version exception needs an explicit product decision and test before claiming draft/publish parity.

## Architecture and ownership decision

Target a staged React/Vite/TypeScript admin SPA, served under the existing Quarkus protected `/admin/*` path, with the same Keycloak session and backend scope enforcement. Keep the current static admin frontend usable during migration. Cut over route by route only after behavior, role/scope, direct-link, keyboard, layout JSON, and mobile read compatibility checks pass. Rebase the active dashboard drift fixes and shared-contract typing tasks at each cutover; backend corrections and OpenAPI parity stay in their existing changes. No existing active change is archived or marked complete by this decision.

The rebuild owns shared admin UI, route migration, editor interaction model, workflow-level backend gaps, and acceptance evidence. `protect-legacy-write-endpoints` owns write route authorization; `harden-platform-security-baseline` owns security headers, Keycloak production setup, input bounds, audit hardening, and infrastructure; `optimize-backend-data-access` owns broad data-access performance and layout row locking; `establish-shared-api-contract` owns global versioning and contract generation. Any new or changed HTTP operation is added to the reviewed `openspec/specs/shared-api/openapi.yaml` in the same implementation tranche and coordinated with that change.

## Delivery priorities

1. Freeze observable route/API/role behavior, capture usable baseline fixtures and screenshots, and close urgent write endpoint/security gaps.
2. Build the protected frontend shell and route fallback; migrate dashboard, region, store, beacon, product, recipe, and diagnostics workflows with parity gates.
3. Rebuild the layout editor with explicit tool state, undo/redo, validation, draft/publish, and legacy/store mode compatibility.
4. Verify complete workflows against a running local stack, the public mobile/customer contracts, accessibility and role matrix, and production packaging; update task boxes only with evidence. Deploy only after the normal release checks and explicit authorization for live rollout.

## Verification commands

```bash
npx -y @fission-ai/openspec@1.3.1 list --json
npx -y @fission-ai/openspec@1.3.1 status --change rebuild-admin-platform
npx -y @fission-ai/openspec@1.3.1 validate --all --strict
```

The last command passed before creating the rebuild change: 40 items passed, 0 failed. Re-run it after every artifact or delta update.
