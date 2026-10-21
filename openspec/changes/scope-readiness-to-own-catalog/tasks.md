## 1. Backend

- [x] 1.1 `StoreProductSource.select`: evaluate only own products when the store has at least one; otherwise keep the global catalog; count the skipped global products.
- [x] 1.2 `ReadinessDtos` (`ProductPage`, `ReadinessInput`, `ReadinessCounts`), `StoreReadinessEvaluator` and `StoreReadinessService` pass `skippedGlobalProducts` through to `counts`.
- [x] 1.3 Tests: `StoreProductSourceTest` (own products replace the global catalog, store without own products, store id match, findings with and without own products), `StoreReadinessResourceTest` (response field).

## 2. Contract and admin UI

- [x] 2.1 Add `counts.skippedGlobalProducts` to `openspec/specs/shared-api/openapi.yaml` and run `npm run contract:types`.
- [x] 2.2 Readiness page: radius input starts at the profile radius and follows a profile change; a manual radius wins until then. Show and export `skippedGlobalProducts`. The setup checklist asks without `radius`.
- [x] 2.3 Unit tests (`readiness.test.ts`) and Playwright tests (`readiness.spec.ts`).

## 3. Verification

- [x] 3.1 `./mvnw test`, `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright test`, `npm run contract:check`, `openspec validate`.
- [ ] 3.2 Human step: deploy the backend and admin UI, then re-run the readiness check for `SPAR-Leonding-002` (expected: no `PRODUCT_NO_SHELF` from global products, `skippedGlobalProducts` 153).
