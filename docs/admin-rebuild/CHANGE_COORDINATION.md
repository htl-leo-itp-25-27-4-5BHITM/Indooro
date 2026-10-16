# Admin rebuild change coordination

Updated: 2026-10-12. Scope: rebuild tasks 1.4–1.6. The candidate remains under `/admin/next/`; no existing route has been cut over. This map identifies where old static-UI acceptance should move. It does not close tasks owned by the active changes. Before closing an overlapping task, its owner must record the agreed rebase in that change's task list and retain its backend/API or global contract obligations.

## `fix-admin-dashboard-contract-drift`

| Existing task | Ownership and disposition | Candidate acceptance/evidence |
| --- | --- | --- |
| 1.1–1.2 smoke mock schema check and corrected fixtures | Shared API / old smoke server ownership stays here; rebuild owns candidate route coverage. | `admin-ui/tests/browser/` fixtures and `npm run verify:candidate`; keep mock-contract validation in the existing change. |
| 2.1–2.5 recipe tag semantics, `stepCount`, product/store paging, OpenAPI | Backend and reviewed OpenAPI ownership stays here. Rebuild consumes the APIs. | `admin-ui/src/RecipesPage.test.ts`, `ProductsPage.test.ts`, `StoresPage.test.ts`; `docs/admin-rebuild/API_CONTRACT_AUDIT.md`. |
| 3.1 logout target | Rebase static UI task to candidate shell acceptance; do not remove backend logout contract work. | Candidate browser tests cover `/admin/logout`; route is implemented in candidate shell. |
| 3.2–3.3 recipe detail preservation and ingredient/step diff | Rebase UI behavior to candidate recipe workflow; keep backend semantics/tests here. | `admin-ui/tests/browser/recipes.spec.ts`; seeded recipe edit/persistence evidence in `docs/admin-rebuild/LIVE_STACK.md`. |
| 3.4 server paging/search/filter for Stores, Rezepte, Produkte and product picker | Candidate owns replacement behavior. Old UI task remains open until owner records the rebase. | `StoresPage.test.ts`, `ProductsPage.test.ts`, `RecipesPage.test.ts`; browser coverage in `admin-ui/tests/browser/candidate.spec.ts` and route specs. |
| 3.5 category request limit and notice | Rebase to candidate category context/import acceptance. | `admin-ui/tests/browser/catalog-import.spec.ts` and category route browser checks; verify 500-item notice specifically before claiming parity. |
| 3.6 readiness, layout placeholders, null numeric values | Backend/OpenAPI ownership remains here; candidate owns UI payload and readiness parity. | `ProductsPage.test.ts`, `admin-ui/tests/browser/products.spec.ts`; documented layout code `310/1/1/1`. |
| 3.7 active layout status and recipe `stepCount` | Backend/OpenAPI ownership remains here; candidate acceptance consumes those fields. | `StoresPage.test.ts`, `RecipesPage.test.ts`, candidate route browser tests. |
| 3.8 mutation feedback and inline error summaries | Candidate owns replacement interaction. | Candidate component/browser tests for failed mutation feedback and drawer error summaries; add/retain direct assertions before marking old task rebased. |
| 3.9 debounce, region-only render, registry clearing, client-side pagination | Candidate owns replacement interaction and typed route state; legacy implementation task is superseded after coordinated rebase. | Candidate list browser tests and route-local query tests; legacy `actionRegistry` details do not apply to React. |
| 3.10 dialog accessibility and store tabs | Candidate owns replacement accessibility behavior. | `admin-ui/tests/browser/accessibility.spec.ts` and route browser tests; retain keyboard/focus assertions. |
| 3.11 cache-busting | Candidate build/package owns immutable asset references; legacy HTML cache version remains with old routes until cutover. | `npm run package:candidate`; verify packaged asset names and direct-link refresh. |
| 4.1 customer `productLocation` | Customer frontend remains owned by this change; it is not replaced by admin routes. | No candidate substitute. Keep original customer test and implementation obligation. |
| 5.1–5.3 and 6.1–6.3 | Test and backend/OpenAPI acceptance remains owned by this change. Candidate browser coverage supplements, not replaces, it. | Existing strict validation and suite evidence in `docs/admin-rebuild/PROGRESS.md`; live recipe acceptance in `docs/admin-rebuild/LIVE_STACK.md`. |

**Coordination state:** the active change's task list now records this ownership split. Candidate code and evidence exist for many mapped behaviors, but overlapping static UI tasks remain unchecked until route parity and cutover. Backend/API tasks and customer task 4.1 remain with `fix-admin-dashboard-contract-drift`.

## `establish-shared-api-contract`

| Existing task | Ownership and disposition | Candidate acceptance/evidence |
| --- | --- | --- |
| 1.1–1.5 contract tooling, operation annotations and normalized/breaking parity | Shared API change owns tools, backend annotations, generated export parity, and CI. The rebuild does not replace or assume these global gates. | `docs/admin-rebuild/API_CONTRACT_AUDIT.md` records operation coverage and residual gaps; strict shared-change task remains open. |
| 2.1–2.4 versioning, deprecation and policy | Shared API change owns route versioning and policy. Candidate uses current same-origin endpoints. | No candidate substitute; preserve the global rollout and compatibility work. |
| 3.1–3.2 error envelope | Shared API change owns backend envelope and contract updates. Candidate API client consumes the documented error shape. | Candidate client tests cover body parsing and validation/conflict responses; this does not satisfy backend refactoring. |
| 4.1 mobile OpenAPI exporter / Swift types | Ownership remains split as already specified: exporter and reviewed-contract filter in shared API; Swift generation in `modernize-ios-client-architecture`. | No candidate substitute. |
| 4.2 generated Admin types and JSDoc checks for legacy `core.js`/`app.js` | Coordinate a rebase: the candidate TypeScript API client and TypeScript compiler replace those static-JS checks for candidate code. Keep shared schema generation and contract freshness gates with this change. Legacy files still need their existing check until route/assets cut over. | `admin-ui/src/api/` typed client; `npm run typecheck`; candidate test/build evidence in `docs/admin-rebuild/PROGRESS.md`. |
| 4.3 generated-file freshness check | Shared API change retains ownership of generated contract artifacts. Candidate's source code is not a generated substitute. | No candidate substitute. |
| 5.1–5.2 httpYac schema validation and smoke mock validation | Shared API change owns schema-driven checks; candidate browser fixtures are additional route tests only. | `docs/admin-rebuild/API_CONTRACT_AUDIT.md` and candidate browser tests; do not treat mocked route tests as contract validation. |
| 6.1 contract CI job and backend test dependency | Shared API change retains CI ownership. | No candidate substitute. |
| 7.1–7.3 contract verification | Shared API change retains global verification. | Existing strict validation is documented in progress notes; rebuild strict validation does not close this task. |

**Coordination state:** the active change's task list now records that the candidate's typed API client replaces the legacy Admin JSDoc/typecheck portion of task 4.2 after cutover. Task 4.2 stays open while current static routes run. All reviewed OpenAPI parity, generated contract, mobile, and CI work remains in `establish-shared-api-contract`.

## `protect-legacy-write-endpoints` and `harden-platform-security-baseline`

| Active change acceptance | Rebuild relationship | Evidence and status |
| --- | --- | --- |
| `protect-legacy-write-endpoints` 2.1–2.8, 3.1–3.4, 4.1–4.3 | Route authorization, anonymous reads, configuration, audit behavior, and role matrix remain owned by this change. Candidate route guards are usability only; backend authorization and scope checks are authoritative. | `docs/admin-rebuild/PROGRESS.md` records admin/region-manager/store-manager live logins, scope denials, direct-link refreshes, and live workflow checks. The active change's full task suite remains unchecked; candidate presence does not close it. |
| `harden-platform-security-baseline` 3.1–3.5 | Security headers and safe rendering remain owned by this change. Candidate is tested under the planned CSP and uses safe text rendering. | `docs/admin-rebuild/PROGRESS.md` records Quarkus/smoke CSP, malicious-label rendering, zero CSP console violations, and browser checks. Production-only HSTS/live OIDC limitations remain. |
| `harden-platform-security-baseline` 4.1–8.5 | Backend validation, audit, infrastructure, deployment, and security verification remain owned by this change. | No candidate UI evidence substitutes for these obligations. Keep active tasks open. |

**Route-switch gate:** the candidate has run below the existing protected admin path with live role/scope acceptance and with CSP-enabled browser/security checks, so rebuild task 1.6 is satisfied as a pre-cutover confirmation. This does not authorize cutover or close either security change; the staged route map and task 3.10 still require route-specific parity evidence before switching each entry.
