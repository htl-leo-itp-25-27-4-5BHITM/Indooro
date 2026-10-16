## Why

The Admin Platform pilot cut can use nine verified replacement routes while the Layout Editor stays on its legacy entry. The broader action, state, accessibility, and mobile evidence in `rebuild-admin-platform` is incomplete, so this follow-up keeps that work visible without blocking preparation of the first supermarket pilot.

## What Changes

- Complete reproducible fixtures and screenshots for the remaining Admin route actions and page states, especially the Store and global Layout Editor.
- Compare authorized Legacy and Candidate Editor workflows on the same fixtures; resolve or explicitly accept observed differences in validation, Preview, Export, Beacon handling, templates, and tools.
- Finish role/scope, direct-link, keyboard/accessibility, empty/error, customer/mobile, and route-rollback evidence before any later Editor cutover.
- Record a final verification report and update the original change's evidence references. No Admin route is switched by this proposal.

## Capabilities

### New Capabilities

- `admin-parity-evidence`: Reproducible acceptance evidence for deferred route, role, state, and Editor cutover checks.

### Modified Capabilities

None. It does not change the existing behavior contract in `admin-platform-management`, `store-layout-management`, or `admin-dashboard`.

## Impact

Evidence scripts and fixtures in `admin-ui/`, documentation under `docs/admin-rebuild/`, and task/evidence links in `openspec/changes/rebuild-admin-platform/`. Existing Quarkus APIs, OIDC roles (`admin`, `region-manager`, `store-manager`), scope enforcement, and the anonymous `/api/mobile/*` contract remain the authoritative runtime boundaries. `/admin/editor/` remains on Legacy for the pilot unless its focused live gate passes; `/admin/next/editor/` remains an authenticated candidate direct link. This proposal does not authorize a production deployment or iOS source changes.
