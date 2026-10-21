## 1. Admin UI

- [x] 1.1 `storeSetup.ts`: pure derivation of the seven steps (done, open, problem, unknown) and loader for the existing endpoints; each failed source becomes null.
- [x] 1.2 `StoreSetupSection.tsx` on the store detail page: summary line, per-step status text and link, admin-only links hidden for other roles, reload after store changes.
- [x] 1.3 No backend or contract change needed (all facts exist); role annotations unchanged.

## 2. Tests

- [x] 2.1 Unit tests `storeSetup.test.ts`: all done, nothing done, beacon inconsistency, empty catalog, shared catalog, search miss, fallback layout, unknown sources, loader.
- [x] 2.2 Playwright `store-setup.spec.ts`: statuses and links for an admin, complete store and hidden admin-only link for a store manager.

## 3. Docs

- [x] 3.1 `docs/pilot-readiness/operations/MARKT_EINRICHTEN.md`; linked from the checklist, the operations index and `scripts/ops/README.md`.

## 4. Verification

- [x] 4.1 `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright test` in `admin-ui`; `./mvnw test`; `npm run contract:check`; `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 4.2 Human step: open the page on the test store `SPAR-Leonding-002` after the next admin rollout and compare each step with reality; check the guide link after merge; confirm the nRF Connect hint on a real beacon.
