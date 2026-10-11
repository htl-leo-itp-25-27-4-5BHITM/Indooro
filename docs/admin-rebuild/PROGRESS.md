# Admin rebuild supervisor handoff

Updated: 2026-10-11. Working branch: `codex/admin-platform-rebuild` in the isolated managed worktree `/Users/erikbergi/.codex/worktrees/admin-rebuild/Indooro`. Base: `origin/main` at `99b802b8`. The original checkout remains on `codex/indooro-v2-roughcut` with unrelated dirty advertising and documentation files; do not stage them into this branch.

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

The initial baseline before these fixes passed 11 Node tests, 12 mocked browser checks, admin asset checks, and 40 OpenSpec validations. Playwright initially lacked Chromium; it is now installed locally. These checks do not prove live database/auth integration.

## Active work and next priorities

1. Finish ingredient/step editing for recipes, with a seeded no-data-loss update test.
2. Verify the packaged candidate through Quarkus/OIDC, then build route parity and role/scope tests before any cutover.
3. Continue legacy write protection and security headers/CSP; verify all public and protected operation classes.
4. Run a local stack with PostgreSQL, OpenSearch, and Keycloak to exercise store creation → beacon assignment → layout draft → publish → anonymous mobile read, plus recipe editing. Current Maven/browser suites rely heavily on mocks.
5. Migrate one admin route at a time and independently review accessibility, responsive behavior, error recovery, and rollback.

Known high-risk gaps: layout version writes lack serialized numbering/activation; catalog IDs are globally keyed in OpenSearch; product import can report misleading success; editor has no complete pure command architecture; admin lists still have paging/filter/focus problems; local production-equivalent stack and role matrix have not been verified.

Before resuming: run `git status --short`, `git log -8 --oneline`, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`, and `npm run admin:verify` from the repository root; run `sh ./mvnw test` from `backend/indooro_server` when tests are not concurrently running. Review active agent commits before updating this record. Do not mark the full rebuild complete until every OpenSpec acceptance scenario and live customer journey is verified.
