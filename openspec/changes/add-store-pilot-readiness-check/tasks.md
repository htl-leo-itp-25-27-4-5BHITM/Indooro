## 1. Setup (only after codex/admin-platform-rebuild is merged into main)

- [x] 1.1 Confirm the admin rebuild merge on `origin/main`; create branch `pilot/store-readiness` from `origin/main`; read this change from `origin/pilot/first-store` if it is not yet on `main` (`git show origin/pilot/first-store:openspec/changes/add-store-pilot-readiness-check/…`) and copy the change folder into the branch as the first commit. (branch `pilot/store-readiness` = `origin/main` incl. admin rebuild; change folder already present)
- [x] 1.2 Run backend tests (`mvnw.cmd test` / `./mvnw test`) and the admin UI checks (`npm run admin:verify` or the scripts in `admin-ui/package.json`); record the baseline in `design.md`. (backend 146/0 before, 182/0 after; admin UI `npm test` 81/81, browser 115/115 after)
- [x] 1.3 Inventory existing checks: `admin-ui/src/editor/validation.ts`, product readiness on the products page, `StoreLayoutAdminService` publication validation; record reusable parts in `design.md`.
- [x] 1.4 Run `npx -y @fission-ai/openspec@1.3.1 validate add-store-pilot-readiness-check --strict`.

## 2. Evaluation Logic (backend, pure Java)

- [x] 2.1 Add `StoreReadinessEvaluator` (input: layout document, product list, assigned beacons, radius; output: findings with severity, code, message, element/product id).
- [x] 2.2 Implement the exact shelf matching helper (category base and meter) and copy the test vectors from `swift/indooro-EinkaeuferFinal/Tests/IndooroNavigationCoreTests/ShelfMatchingTests.swift` (available on `pilot/first-store`) into a JUnit test.
- [x] 2.3 Implement all blocking checks and warnings of the requirement; unit tests per check, including rotated shelves and missing labels.
- [x] 2.4 Implement beacon coverage per design decision 3; unit test with a 20 × 20 m layout and 4 vs 9 beacons.

## 3. Endpoint

- [x] 3.1 Add `StoreReadinessResource` `GET /api/stores/{storeId}/readiness?radius=8.0` with roles and `AdminAccessService` scope checks; load active layout, store products (paged), assignments.
- [x] 3.2 Add `@QuarkusTest` tests: admin 200, store manager own store 200, other store 403, anonymous 401, store without active layout returns a blocking finding.
- [x] 3.3 Update `openspec/specs/shared-api/openapi.yaml` (route, schema) and the httpyac role matrix file if present.

## 4. Admin Page

- [x] 4.1 Add API client function and types in `admin-ui/src/api/`.
- [x] 4.2 Add page „Pilot-Bereitschaft“ (route under store detail): traffic light, grouped findings, links to editor element and product, „Als Markdown kopieren“; German texts; empty, loading and error states with retry.
- [x] 4.3 Add unit tests for the Markdown export and a mocked browser test for red/green/403 states.
- [x] 4.4 Build the admin per the documented admin build process and verify the page on a local stack. Done 2026-10-16 with an isolated local full stack (Quarkus dev + PostgreSQL 17 + OpenSearch 2.9 + Keycloak 26, seeded by `scripts/dev/seed_readiness_demo.py`): the real endpoint answers for an admin (200), a store-manager without assignment (403) and without token (302 to login); the page was rendered from the real responses (`docs/pilot-readiness/evidence/store-readiness/`). The full-stack run found one display defect (563 of 564 cells shown as „100 %“), fixed to one decimal place. The login in a real browser was not exercised.

## 5. Verification and Handover

- [x] 5.1 Run backend tests, admin checks, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [x] 5.2 Open a pull request `pilot/store-readiness` → `main`; update `docs/pilot-readiness/team/STATUS.md` (row „Erik“).
