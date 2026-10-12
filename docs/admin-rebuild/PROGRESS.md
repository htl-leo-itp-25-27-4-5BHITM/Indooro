# Admin rebuild supervisor handoff

Updated: 2026-10-12. Working branch: `codex/admin-platform-rebuild` in the isolated managed worktree `/Users/erikbergi/.codex/worktrees/admin-rebuild/Indooro`. Base: `origin/main` at `99b802b8`. The original checkout remains on `codex/indooro-v2-roughcut` with unrelated dirty advertising and documentation files; do not stage them into this branch.

## Decisions and source of truth

- `docs/admin-rebuild/BASELINE.md` records runtime authorities, features, test boundaries, and reproduced UX issues.
- `docs/admin-rebuild/OPENSPEC_AUDIT.md` inventories active changes and their ownership. `openspec/changes/rebuild-admin-platform/` defines the staged React/Vite/TypeScript target with protected route parity gates. Permanent admin/layout specs from the archived 2026-09-21 redesign are target requirements, not evidence that implementation happened.
- Store layouts in PostgreSQL and legacy global layouts in OpenSearch remain distinct. Preserve public mobile/current-layout and customer consumers during migration. Keep Keycloak/Quarkus authorization server-side.
- No production data, migrations, deployment, push, or shared branch history has been changed in this work.

## Verified commits

| Commit | Change and OpenSpec trace | Evidence |
| --- | --- | --- |
| `0603164` | Admin logout, layout-code readiness, numeric null, status fields; dashboard drift 3.1/3.6/3.7 | Admin build, unit and mocked browser tests passed. |
| `6daed83` | Legacy layout POST admin-only; partial `protect-legacy-write-endpoints` | Six route tests; 76 Maven tests passed at that checkpoint. |
| `2aab409` | Editor output encoding; security 3.1/6.2 | Malicious-label browser test and unit escaping test passed. |
| `1715534`, `d0c826b` | Active-change audit and staged rebuild OpenSpec artifacts | Strict OpenSpec validation passed 41/41. |
| `6e5a394` | Customer map/search output encoding; security 3.2 | Browser test rendered malicious layout/product text literally. |
| `b65927c` | Recipe tag omission keeps assignments; dashboard drift 2.1 | `RecipeTagAssignmentTest` null/empty/replacement passed. |
| `96798a4` | Reversible editor history for draw/move/properties/duplicate/delete | Admin verify: 17 Node and 21 mocked browser tests passed. |
| `b8420b6`, `55b7a13` | Shared layout document validation and full bounding-box check; security 4.1 | Validator/default fixture and service tests; Maven 90 tests passed at `b8420b6`, targeted boundary test passed after `55b7a13`. |
| `350028e` | Isolated typed React/Vite admin source and API client; rebuild 2.1/2.4 | Typecheck, lint, seven tests, build, strict OpenSpec validation passed. No route cutover. |
| `31196e0` | Recipe edit loads full detail and preserves metadata; dashboard drift 3.2 | Seeded recipe browser regression passed. |
| `6bb27ad` | Explicit inactive first layout draft; rebuild 4.6 | Admin/mobile service tests passed. |
| `dd22502` | Candidate frontend packaged under `/admin/next/` without replacing current routes | Candidate lint, seven unit tests, package verification, browser deep-link smoke passed. |
| `6aea5b8` | Editor unsaved-change warning and save-failure feedback | Legacy admin verify: 17 Node and 25 browser checks passed. |
| `b4fa9e2` | Candidate identity bootstrap, staff navigation, scope denial, and logout | Candidate lint, typecheck, nine unit and three browser checks passed. |
| `25eab1c` | Admin smoke server sends planned CSP and security headers | Legacy admin verify passed with CSP enabled. |
| `58c29a8` | Quarkus security headers and removal of unused customer CDN script | `SecurityHeadersTest` and full 95-test Maven suite passed; 25 browser checks passed with CSP. |

The initial baseline before these fixes passed 11 Node tests, 12 mocked browser checks, admin asset checks, and 40 OpenSpec validations. Playwright Chromium is installed locally. The dated checkpoint below supersedes these earlier test counts.

The local Admin smoke server and Quarkus now send the planned CSP and security headers. The unused customer Tailwind CDN script was removed; existing customer classes are defined in local CSS. All 25 browser tests pass with CSP enabled, and editor/customer malicious-label checks show literal rendering without CSP console violations. `SecurityHeadersTest` confirms Quarkus headers on root, customer, and admin pages. Production-only HSTS and the live OIDC flow remain unverified.

## Active work and next priorities

1. Finish ingredient/step editing for recipes, with a seeded no-data-loss update test.
2. Verify the packaged candidate through Quarkus/OIDC, including scope denial, then build route parity tests before any cutover.
3. Continue legacy write protection and security headers/CSP; verify all public and protected operation classes.
4. Run a local stack with PostgreSQL, OpenSearch, and Keycloak to exercise store creation → beacon assignment → layout draft → publish → anonymous mobile read, plus recipe editing. Current Maven/browser suites rely heavily on mocks.
5. Migrate one admin route at a time and independently review accessibility, responsive behavior, error recovery, and rollback.

Known high-risk gaps: the layout row lock lacks live concurrent-write evidence; catalog IDs are globally keyed in OpenSearch; product import can report misleading success; routing readiness cannot yet be proven from the existing layout metadata; local role matrix and customer journeys have not been verified.

Before resuming: run `git status --short`, `git log -8 --oneline`, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`, and `npm run admin:verify` from the repository root; run `sh ./mvnw test` from `backend/indooro_server` when tests are not concurrently running. Do not mark the full rebuild complete until every OpenSpec acceptance scenario and live customer journey is verified.

## 2026-10-12 checkpoint

The isolated branch now contains candidate React routes under `/admin/next/` for dashboard, regions, store list/create/detail, beacons, products, categories, recipes, diagnostics, store layout editor, and admin-only global layout editor. Existing `/admin/*` entries remain the release path. The candidate navigation stays within `/admin/next/`; the store-manager editor link includes the assigned store ID. Store draft save and activation are separate; the editor reads the public mobile current-layout endpoint for a read-only preview. Representative shipped and store JSON fixtures are tested for lossless edits.

Relevant verified commits: `905abf5` (store active-layout filter), `8e20b40` (recipe step count), `03cde01` (legacy recipe ingredient/step edits), `d09531c` (resume newest draft), `abb7ce1`/`9ccd03b`/`7324d2d`/`f323455` (editor), `d229eaa`/`e64be2b`/`c720557`/`f227298`/`198cb89`/`6ae3e38`/`7d1ce02` (candidate routes/navigation), `8ec7c45`/`7fe1f2b`/`d7dab60`/`53b0cb2` (page modules), `ddc00ed` (paged admin product search), and `e553078` (store-row lock before layout version mutation).

Latest completed checks: candidate `npm run lint`, `npm test` (47/47), `npm run package:candidate`, `npm run verify:candidate`, and `npm run test:browser` (27/27). Full Maven suite passed 107/107 after product paging and row locking; the service mock was updated to exercise the new lock path. Legacy `npm run admin:verify` passed 17 Node and 27 browser checks. Strict OpenSpec validation passed 41/41 after the latest task checkbox changes. All candidate browser checks use mocked APIs.

Docker Desktop was started on 2026-10-12. A dedicated local PostgreSQL 17 container named `indooro-admin-rebuild-pg` listens on `127.0.0.1:55433`; `docker compose -p indooro-admin-rebuild up -d keycloak opensearch` was started to isolate volumes from the existing `indooro_opensearch_data`. Verify container readiness before starting Quarkus with `DB_PORT=55433`. Do not remove unrelated Docker containers or volumes.

Open work: live OIDC/role/scope and PostgreSQL/OpenSearch workflow tests; candidate route parity for region edit/archive, beacon and product mutations, recipe create/publish, catalog import review; one-active-version concurrency evidence in PostgreSQL; current iOS/customer compatibility; accessibility/responsive review; packaged release, rollback, and documentation. No current `/admin/*` route has been cut over and no deployment/push has occurred.
