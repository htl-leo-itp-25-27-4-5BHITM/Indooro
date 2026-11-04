## 1. Backend

- [x] 1.1 Migration `V20__store_released.sql` (additive, existing stores stay released) and `StoreEntity.released`.
- [x] 1.2 `MobileStoreService.listStores` lists only released active stores; `createStore` creates unreleased.
- [x] 1.3 `PATCH /api/stores/{id}/release` and `/withdraw` (admin, idempotent, audited, 409 for archived stores); `released` in the two admin store responses.
- [x] 1.4 Unit tests `StoreReleaseGateTest`.

## 2. Contract and UI

- [x] 2.1 `openspec/specs/shared-api/openapi.yaml` and `npm run contract:types`.
- [x] 2.2 `StoreDetailPage`: section "Kundenansicht" with release and withdraw; Playwright tests.

## 3. Ops and docs

- [x] 3.1 `smoke_check.sh`: WARN for a listed market with 0 own products; test adapted.
- [x] 3.2 `MARKT_EINRICHTEN.md` step 8.

## 4. Verification

- [x] 4.1 `./mvnw test`, `npm test`, `npm run typecheck`, `npm run test:browser`, `npm run contract:check`, `npm run contract:test`, `openspec validate --all --strict`, `bash -n scripts/ops/smoke_check.sh`.
- [ ] 4.2 Human step: after the next rollout create a test market, check that it is absent from `/customer/` and the iOS market list, release it, check that it appears.
