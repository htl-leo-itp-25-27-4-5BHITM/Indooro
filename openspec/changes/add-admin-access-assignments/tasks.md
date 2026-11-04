## 1. Backend

- [x] 1.1 `AccessAssignmentService`: list, create (role and scope validation, active region or store, one active row per subject, flush for the unique index), deactivate (not the own row, idempotent), audit entries `USER_ACCESS`.
- [x] 1.2 `AccessAssignmentResource` under `/api/admin/access-assignments`, only `admin`; `GET /api/admin/me/identity` with `@Authenticated`.
- [x] 1.3 Tests: `AccessAssignmentServiceTest` (validation, conflicts, audit, created store manager is scoped to one store), `AccessAssignmentResourceTest` (role lock, request validation), `AdminCurrentIdentityResourceTest`.

## 2. Contract and admin UI

- [x] 2.1 Paths and schemas in `openspec/specs/shared-api/openapi.yaml`, `npm run contract:types`.
- [x] 2.2 Page "Zugänge" (admin only) with store and region pickers and deactivate; forbidden page shows the own subject to copy.
- [x] 2.3 Unit tests (`accessAssignments.test.ts`, `routes.test.ts`) and Playwright (`access-assignments.spec.ts`).

## 3. Docs and verification

- [x] 3.1 `ADMIN_LOGIN.md`, `MARKT_EINRICHTEN.md` and `DEPLOYMENT.md` without the SQL step.
- [x] 3.2 `./mvnw test`, `npm test`, `npm run typecheck`, `npm run test:browser`, `npm run contract:check`, `npm run contract:test`, `openspec validate --all --strict`.
- [ ] 3.3 Human step after deploy: create a store-manager for one store in the live admin, sign in as that user and check that only this store is visible.
