## Why

Giving a new operator access to the admin UI needs two tools today: the Keycloak console for the user and its realm role, and a manual `INSERT` into `user_access_assignments` with `psql` for the role and scope. The second step needs a developer with database access (sprint review `docs/reviews/SPRINT_STORE_ONBOARDING_REVIEW.md`, finding D2, task T2). The spec `admin-role-access-control` describes how assignments are read but has no requirement for creating or ending one.

## What Changes

- New admin-only API `/api/admin/access-assignments` (`@RolesAllowed("admin")`): list (optional `status`), create, and deactivate (`PATCH /{assignmentId}/deactivate`). It writes the existing table `user_access_assignments` from Flyway V4; no migration.
- Validation: `store-manager` needs `storeId` and no `regionId`; `region-manager` needs `regionId` and no `storeId`; `admin` has neither. The region or store must exist and be active. One active row per Keycloak subject (409 otherwise, also when the partial unique index `uk_user_access_active_subject` rejects a concurrent insert). An admin cannot deactivate the own assignment (409). Deactivating a disabled row changes nothing.
- Every create and deactivate writes an audit entry `USER_ACCESS` / `CREATE` or `DEACTIVATE` with before and after state.
- New endpoint `GET /api/admin/me/identity` for every signed-in user (`@Authenticated`): subject, username and email from the token, without a database lookup. The admin UI shows the subject on the "Zugriff verweigert" page with a copy button.
- Admin UI: page "Zugänge" (`/admin/next/access/`, role `admin` only) with list, status filter, create form with store and region pickers, and a deactivate action.
- Docs: `ADMIN_LOGIN.md` and `MARKT_EINRICHTEN.md` describe the UI flow instead of SQL.

Keycloak users and realm roles are still created in the Keycloak console. The backend does not call the Keycloak admin API.

## Impact

- Affected: backend `admin/service/AccessAssignmentService`, `admin/dto/AccessAssignmentDtos`, `UserAccessAssignmentRepository`, `AdminAccessService.currentIdentity`, `resource/admin/AccessAssignmentResource`, `AdminCurrentUserResource`; shared API contract (two paths, one path for identity, three schemas, tag `admin-access`); admin UI (`AccessAssignmentsPage`, `ForbiddenIdentity`, `accessAssignments.ts`, `routes.ts`, `main.tsx`); docs.
- No migration, no change to the apps. Existing rows (Flyway seeds V4, V5, V17) stay valid.
- An assignment change takes effect with the next request: the current user is resolved per request.
