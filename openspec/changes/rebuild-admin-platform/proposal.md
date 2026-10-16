## Why

The current Admin Platform presents protected routes and working domain APIs, but its shared static script, duplicated pages, incomplete editor workflows, and documented contract defects make routine staff work unreliable. Permanent OpenSpec UX requirements from an archived planning change have not been implemented, and the active dashboard, security, data-access, and shared-API changes must be coordinated rather than overwritten.

## What Changes

- Rebuild the Admin Platform as a staged React/Vite/TypeScript application served by Quarkus under existing protected `/admin/*` URLs. Keep the current static application usable until each route passes parity checks and is cut over.
- Provide focused, role-aware dashboard, region, store, beacon, product, recipe, and diagnostics workflows with explicit loading, empty, validation, conflict, authorization, and success states.
- Build a dedicated store/layout editor with stable canvas interactions, element inspector and list, undo/redo, validation, preview, version save, and publish/activate behavior while preserving layout JSON and mobile reads.
- Close proven workflow gaps that the existing APIs cannot safely support, including lossless recipe editing, paged lists, and draft versus active layout semantics, in coordination with active changes that already own those fixes.
- Package and test the frontend through the current Quarkus deployment path, preserve Keycloak/OIDC and backend role/scope enforcement, and document route-by-route migration and rollback.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `admin-dashboard`: Replace the permanent build-free/single-script architecture requirement with a verified staged frontend migration and maintainable typed page modules.
- `admin-platform-management`: Make end-to-end staff workflows, role-aware state, and route parity measurable during the rebuild.
- `store-layout-management`: Make editor command behavior, validation, draft/publish, and mobile compatibility measurable.
- `catalog-maintenance-operations`: Define safe preview/commit behavior for admin bulk catalog workflows using the available API surface, with unsupported persistence paths clearly blocked.
- `backend-core`: Require lossless workflow mutations and conflict-safe layout publication where backend changes are necessary.
- `shared-api`: Require reviewed contracts and consumer compatibility for any rebuild-owned HTTP change.
- `deployment-operations`: Define the frontend build, protected route serving, rollback, and production verification gate.

## Impact

- Frontend: existing static admin assets plus a new admin source workspace and build output under `backend/indooro_server/src/main/resources/META-INF/resources/admin`.
- Backend: admin resource/service/DTO behavior only where existing contracts cannot safely support required workflows; PostgreSQL/Flyway changes only if verified necessary; OpenSearch catalog maintenance may require explicit import review safeguards.
- Access: `/admin` and `/admin/*` remain authenticated. Admin APIs remain protected by `admin`, `region-manager`, or `store-manager` role and database assignment scope as specified in `admin-authentication` and `admin-role-access-control`. Public mobile/customer GET routes and current anonymous customer use remain available.
- Contracts: reviewed `openspec/specs/shared-api/openapi.yaml` and existing iOS/customer consumers remain compatible unless a separately specified, versioned change is agreed.
- Related active changes: `protect-legacy-write-endpoints`, `harden-platform-security-baseline`, `fix-admin-dashboard-contract-drift`, `optimize-backend-data-access`, and `establish-shared-api-contract` retain their ownership. The full overlap and dependency record is `docs/admin-rebuild/OPENSPEC_AUDIT.md`.
- Acceptance proof: a store manager can complete an in-scope store/layout workflow and is denied out-of-scope data; an admin can edit a recipe without losing image, tags, ingredients, or steps; a saved draft does not change the active mobile map; direct admin links and public mobile/customer reads continue to work after cutover.
