## 1. Backend

- [x] 1.1 Extend `coverage-rule.json` with `profiles` (`testroom`); `CoverageRule` parses profiles with inheritance and validation; `StoreReadinessProfiles` exposes the ids.
- [x] 1.2 Flyway `V19__store_readiness_profile.sql`; `StoreEntity.readinessProfile`; `StoreDetailResponse` and `StoreUpsertRequest` carry it; `StoreAdminService` lets only an admin change it.
- [x] 1.3 `StoreReadinessEvaluator`, `ReadinessDtos` and `StoreReadinessService`: evaluate with the store's profile, default radius from the profile, report `profile`, `coverageComputed`, rule values and the warning `COVERAGE_NOT_COMPUTED`.
- [x] 1.4 Tests: `CoverageRuleTest` (profiles), `StoreReadinessEvaluatorTest` (empty test room GREEN with `testroom`, YELLOW with `market`, corner beacons still warn, not computed), `StoreReadinessServiceProfileTest`, `StoreAdminServiceReadinessProfileTest`.

## 2. Contract and admin UI

- [x] 2.1 Update `openspec/specs/shared-api/openapi.yaml` and run `npm run contract:types`.
- [x] 2.2 Readiness page and Markdown export show profile, rule and computed share, and "Abdeckung nicht berechnet"; store detail page shows the profile and lets an admin change it.
- [x] 2.3 Unit tests (`readiness.test.ts`, `editor/coverage.test.ts`) and Playwright tests (`readiness.spec.ts`, `store-detail.spec.ts`).

## 3. Docs and verification

- [x] 3.1 Note the proposal in `docs/pilot-readiness/team/STATUS.md` and `hardware/PLANNER.md`.
- [x] 3.2 `./mvnw test`, `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright test`, `npm run contract:check`, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 3.3 Human step: decide the final `testroom` values (Erik) and apply migration V19 with the next backend rollout.
