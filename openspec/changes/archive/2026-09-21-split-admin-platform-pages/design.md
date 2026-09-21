## Context

The Admin Platform is currently a static HTML/CSS/JavaScript surface served from `backend/indooro_server/src/main/resources/META-INF/resources/admin`. The main `index.html` contains all dashboard, region, store, store-detail, beacon, product, and recipe sections, while `app.js` eagerly queries DOM elements for every section and bootstraps all workflows together. Navigation is based on hash anchors, which limits deep linking and makes page-level states harder to reason about.

Quarkus already protects `/admin` and `/admin/*`, and the existing backend APIs enforce role and scope rules. `/admin/editor/` and `/admin/server-logs/` are already real static subpages. This change keeps the backend and security model intact while restructuring the static frontend into focused pages.

## Goals / Non-Goals

**Goals:**

- Split the Admin Platform into real protected subpages under `/admin/`.
- Keep existing backend endpoints, payloads, role checks, scope checks, and workflows compatible.
- Hide admin-only navigation and workflows from non-admin roles on every page.
- Make `/admin/stores/detail/?storeId=<id>` the direct store-detail route and support an empty selection state when `storeId` is absent.
- Convert visible German Admin Platform copy to native German spelling.
- Improve the desktop Admin Platform visual system, page hierarchy, empty/loading/error states, and the layout editor's professional workflow feel.

**Non-Goals:**

- No backend API redesign.
- No Keycloak realm/client or role model changes.
- No mobile/customer behavior changes.
- No new data model, migration, or persistent settings.
- No mobile-first redesign; desktop and notebook use remain the priority.

## Decisions

### 1. Use static multi-page admin pages with shared browser scripts

Each page will have its own `index.html` and small page module. Shared helpers for API calls, current user loading, role handling, formatting, status messages, shell navigation, and common rendering utilities will live in shared static JavaScript files.

Alternative considered: duplicate the current `index.html` and `app.js` for each page. Rejected because it would keep the eager DOM coupling and make future role/state fixes more fragile.

### 2. Keep static routing under Quarkus resources

The page paths will be static directories:

- `/admin/`
- `/admin/regions/`
- `/admin/stores/`
- `/admin/stores/detail/?storeId=<id>`
- `/admin/beacons/`
- `/admin/products/`
- `/admin/recipes/`
- `/admin/server-logs/`
- `/admin/editor/`

This matches Quarkus static resource serving and avoids adding backend routing logic.

Alternative considered: introduce a frontend router or framework. Rejected because the current project uses static HTML/CSS/JS and the requirement is to preserve behavior while improving structure.

### 3. Treat admin-only pages as invisible to non-admins

Admin-only navigation entries for products, recipes, system logs, and server logs will be hidden for `region-manager` and `store-manager`. If a non-admin directly opens an admin-only page, the page will show no management workflow and will navigate back to the dashboard or render a minimal access-denied state without protected data.

Alternative considered: show disabled links. Rejected because the user explicitly requested that non-admins should not see those areas.

### 4. Preserve the editor's data model and improve only the surface

The layout editor will keep its legacy/global mode and store-specific mode. The UI can be restyled substantially and its German text updated, but the editor's saved JSON contract and API behavior must remain unchanged.

Alternative considered: rewrite the editor interaction model. Rejected because editor workflow expansion is a separate product change and would require more FSD.

## Risks / Trade-offs

- Static path serving differs between local dev and deployed Quarkus → Verify the new subpage URLs through a running backend or static server where possible, and keep files in conventional `index.html` directory layout.
- Splitting JavaScript can accidentally drop an existing workflow → Migrate one workflow per module and smoke test key actions for each page.
- Role-aware hiding is frontend-only for visibility → Backend role and scope checks remain the enforcement boundary; frontend hiding is usability and information architecture.
- Visual editor redesign can disrupt existing editor IDs → Preserve IDs used by `editor.js` and change styling/markup carefully.

## Migration Plan

1. Add shared admin CSS and JavaScript helpers.
2. Replace the old hash dashboard with a real `/admin/` dashboard.
3. Add dedicated management directories and page modules.
4. Update all internal links from hashes to real URLs.
5. Update editor back links and server-log navigation.
6. Run OpenSpec validation, targeted static checks, and browser smoke checks.

Rollback is static-file based: restore the previous `admin/index.html`, `app.css`, `app.js`, editor files, and server-log files if the multi-page surface cannot be completed safely.

## Open Questions

- None. The user confirmed the URL structure, non-admin visibility behavior, store-detail empty state, permission to add files, and a stronger visual editor redesign.
