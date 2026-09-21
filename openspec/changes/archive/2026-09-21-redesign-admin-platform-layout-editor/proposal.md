## Why

The current Admin Platform has the right operational scope, protected APIs, and domain model, but the user experience still feels like a partially split one-page form surface: duplicated subpage HTML, one shared script bootstrapping every workflow, wide forms, weak workflow guidance, and an editor that behaves more like a patched configurator than a professional planning tool. Indooro now needs a full product/UX redesign so staff can manage stores, beacons, catalog data, recipes, and layouts with confidence while keeping the existing backend contracts and mobile behavior stable.

## What Changes

- Redesign the Admin Platform as a calm, task-focused SaaS/operations surface with a persistent shell, role-aware navigation, breadcrumbs, page headers, scoped actions, and clear location context.
- Replace the current duplicated subpage shell with page-specific Admin Platform modules for dashboard, regions, stores, store detail, beacons, products, recipes, server logs, and layout editor entry points.
- Preserve the current protected route model under `/admin/` and the existing backend APIs unless a later implementation task proves a small compatibility endpoint is needed.
- Redesign dashboard content around operational signal: scoped counts, unresolved setup work, recent audit events, quick actions, and optional system status.
- Re-plan store management around region/store list pages, store detail tabs, layout versions, beacon assignments, audit history, and guided create/edit workflows.
- Re-plan beacon management around free versus assigned beacons, assignment/release flows, identity validation, ambiguous assignment warnings, and store context.
- Re-plan product/catalog management around searchable lists, category context, import/bulk review, layout-code readiness, store-aware product fields, and validation.
- Re-plan recipe administration around list/detail editing, ingredients, steps, tags, product mapping suggestions, publish/deactivate/archive actions, and mobile readiness preview.
- Redesign the layout editor as a dedicated tool with toolbar modes, canvas workspace, zoom/pan/grid controls, snap behavior, inspector panel, layer/element list, validation, version save/publish, mobile preview, and store-aware beacon/product-position handling.
- Introduce a design-system plan for tokens, layout primitives, buttons, inputs, tables, forms, dialogs, empty/loading/error states, validation messages, and permission affordances.
- Evaluate whether to keep the static HTML/CSS/JavaScript frontend or migrate the Admin Platform to a modern TypeScript SPA, with an explicit recommendation, risks, and migration path.
- Keep mobile/iOS behavior, public customer routes, Keycloak roles, backend scope checks, and layout JSON compatibility intact.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `admin-platform-management`: Adds the redesigned Admin Platform information architecture, shell, page model, dashboard, guided workflows, design system expectations, admin list/detail/form states, recipe/product/beacon/store UX requirements, and role-aware page behavior.
- `store-layout-management`: Adds the redesigned layout editor tool model, including toolbar modes, canvas interactions, inspector/layers, grid/zoom/pan/snap, undo/redo expectations, validation, versioning, preview, and store-aware beacon/product placement.
- `catalog-maintenance-operations`: Adds Admin Platform catalog maintenance UX requirements for product/category list management, bulk/import review, validation, and layout-code/store-readiness feedback while preserving existing catalog maintenance APIs.
- `product-catalog-search`: Adds product-location readiness requirements for admin-managed catalog records so the redesigned UI can surface unresolved or non-routable product location data without changing public search route boundaries.
- `deployment-operations`: Adds build, asset, route, and verification expectations for the redesigned Admin Platform and layout editor, including how any frontend build output must remain deployable through the existing Quarkus/LeoCloud path.

## Impact

- Admin static frontend under `backend/indooro_server/src/main/resources/META-INF/resources/admin`, especially `index.html`, duplicated subpage `index.html` files, `app.js`, `app.css`, `editor/index.html`, `editor.js`, `editor.css`, and `server-logs/*`.
- Protected admin APIs under `/api/admin/*`, `/api/regions`, `/api/stores`, `/api/beacons`, `/api/admin/products`, `/api/admin/recipes`, `/api/admin/recipe-tags`, and `/api/stores/{storeId}/layout/*`.
- Public customer/mobile contracts under `/api/mobile/*`, `/api/products`, `/api/categories`, and `/api/layout` remain in place.
- OpenSpec specs for Admin Platform management, store layout management, catalog maintenance, product catalog search, and deployment operations.
- Possible future frontend dependency/build changes if the implementation adopts a TypeScript SPA; no backend technology change is proposed by default.
