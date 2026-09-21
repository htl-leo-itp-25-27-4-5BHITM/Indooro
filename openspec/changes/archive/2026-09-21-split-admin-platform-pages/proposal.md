## Why

The Admin Platform currently behaves as one long hash-based page, which makes operational workflows harder to scan, deep-link, and protect visually by role. Splitting it into real protected subpages lets staff use focused admin workflows while preserving the existing Keycloak, role, scope, and API contracts.

## What Changes

- Replace the hash-based Admin Platform navigation with real protected subpages under `/admin/`.
- Keep `/admin/` as the dashboard and add dedicated pages for regions, stores, store detail, beacons, products, and recipes.
- Preserve `/admin/editor/` and `/admin/server-logs/` as dedicated protected pages while visually modernizing them.
- Hide admin-only product and recipe navigation from non-admin users instead of merely disabling it.
- Show a store-detail empty/select state when `/admin/stores/detail/` is opened without `storeId`.
- Convert visible German UI text to proper umlauts and `ß` where German words are intended.
- Improve the Admin Platform's desktop SaaS presentation with clearer navigation, hierarchy, controls, loading states, empty states, error states, and role-aware page states.
- Preserve existing backend APIs, data contracts, Keycloak login/logout behavior, role checks, and scoped management workflows.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `admin-platform-management`: Defines the Admin Platform as a protected multi-page staff surface under `/admin/` with role-aware navigation, direct store-detail URLs, German UI copy expectations, and preserved admin workflows.

## Impact

- Static Admin Platform files under `backend/indooro_server/src/main/resources/META-INF/resources/admin`.
- Shared Admin Platform JavaScript and CSS structure for dashboard, regions, stores, store detail, beacons, products, recipes, server logs, and editor.
- Existing protected admin APIs under `/api/admin/*`, `/api/regions`, `/api/stores`, `/api/beacons`, `/api/admin/products`, and `/api/admin/recipes`.
- Existing Quarkus OIDC and HTTP auth path protection for `/admin` and `/admin/*`.
- OpenSpec capability documentation for Admin Platform navigation and UX behavior.
