## 1. OpenSpec and Baseline

- [x] 1.1 Create the `redesign-admin-platform-layout-editor` OpenSpec change.
- [x] 1.2 Review current OpenSpec specs and active changes for Admin Platform, layout, catalog, auth, roles, deployment, and recipes.
- [x] 1.3 Inspect current Admin Platform, layout editor, server-log page, backend APIs, auth configuration, tests, and deployment structure.
- [x] 1.4 Create proposal, delta specs, design, and implementation task plan without changing production code.
- [x] 1.5 Coordinate with active `split-admin-platform-pages` and `add-recipe-shopping-list-integration` changes before implementation starts.
- [x] 1.6 Capture baseline screenshots or notes for existing Admin Platform pages and the layout editor.
- [x] 1.7 Create route/API inventory for all admin pages and workflows to preserve during migration.

## 2. Frontend Architecture Setup

- [x] 2.1 Decide final admin frontend source location and document it.
- [x] 2.2 Add the selected frontend build stack if approved, preferably React/Vite/TypeScript.
- [x] 2.3 Configure build output to be served by Quarkus under `META-INF/resources/admin`.
- [x] 2.4 Add local development scripts for the admin frontend.
- [x] 2.5 Add lint, typecheck, unit-test, and build scripts.
- [x] 2.6 Remove runtime CDN dependencies from the target editor implementation.
- [x] 2.7 Verify protected `/admin/*` route fallback behavior for the selected frontend routing approach.

## 3. Shared Admin Foundation

- [x] 3.1 Implement the redesigned admin shell with left navigation, page header, breadcrumbs, user identity, role/scope display, and logout.
- [x] 3.2 Implement role-aware navigation and direct URL protection states for `admin`, `region-manager`, and `store-manager`.
- [x] 3.3 Implement shared API client behavior for same-origin credentials, JSON parsing, 401 handling, 403 handling, validation errors, and single-read response bodies.
- [x] 3.4 Implement design tokens for color, typography, spacing, radius, elevation, and status states.
- [x] 3.5 Implement shared components for buttons, icon buttons, tooltips, forms, fields, filters, tables, dialogs, toasts, tabs, badges, empty states, loading states, and error states.
- [x] 3.6 Implement shared table/list patterns with search, filters, sorting, pagination, row actions, empty states, and responsive behavior.
- [x] 3.7 Implement shared wizard/stepper patterns for complex admin workflows.

## 4. Core Admin Pages

- [x] 4.1 Rebuild `/admin/` dashboard with scoped KPIs, setup warnings, recent audit events, quick actions, and optional system status.
- [x] 4.2 Rebuild `/admin/regions/` with region table/list, detail access, create/edit flow, archive confirmation, loading, empty, error, and access-denied states.
- [x] 4.3 Rebuild `/admin/stores/` with searchable/filterable/sortable store list, scoped data, create action, detail links, layout status, beacon count, and empty states.
- [x] 4.4 Rebuild guided store create/edit flow with identity, region, address, coordinates, notes, validation, review, save, and post-save next actions.
- [x] 4.5 Rebuild store detail with metadata, tabs or sections for beacons, layout versions, audit history, and editor entry points.
- [x] 4.6 Preserve compatibility for `/admin/stores/detail/?storeId=<id>` and define redirect or routing behavior if a cleaner route is added.
- [x] 4.7 Rebuild `/admin/server-logs/` inside the shared shell with diagnostics list, stack trace inspection, refresh, and admin-only behavior.

## 5. Beacon Workflows

- [x] 5.1 Rebuild beacon inventory with free/assigned/archived filters, search, sorting, identity columns, assignment state, and empty states.
- [x] 5.2 Rebuild beacon create/edit form with inline UUID, major, minor, beacon code, and duplicate/identity validation.
- [x] 5.3 Rebuild bulk beacon creation with parse/review/validation/commit/summary steps.
- [x] 5.4 Implement guided beacon assignment from beacon list and store detail contexts.
- [x] 5.5 Implement release and archive confirmations with clear effects and post-action context.
- [x] 5.6 Surface ambiguous, invalid, duplicate, or out-of-scope beacon states distinctly.

## 6. Catalog and Recipe Workflows

- [x] 6.1 Rebuild product catalog list with search, filters, sorting, pagination, layout-code readiness, store metadata, and row actions.
- [x] 6.2 Rebuild product create/edit/detail workflow with validation for id, name, price, layout code, and optional store fields.
- [x] 6.3 Implement product delete confirmation and post-delete state handling.
- [x] 6.4 Implement product/category import review flow if current backend APIs support the required commit behavior.
- [x] 6.5 Rebuild category management or document why category mutation remains limited to import/admin maintenance.
- [x] 6.6 Rebuild recipe list with search, status filters, mapping readiness, publish state, and row actions.
- [x] 6.7 Rebuild recipe detail editor with metadata, tags, ingredients, steps, preview, and publish readiness sections.
- [x] 6.8 Rebuild ingredient/product mapping workflow with mapping status, suggestions, manual search/selection, confidence/reason display, and non-routable warnings.
- [x] 6.9 Implement publish, deactivate, and archive confirmations for recipes.

## 7. Layout Editor Redesign

- [x] 7.1 Implement editor shell with toolbar, canvas stage, left tool/library panel, right inspector, layer/element list, status bar, validation panel, and store context.
- [x] 7.2 Implement editor modes for select, move, draw/add, edit, and delete with visible active state and keyboard shortcuts.
- [x] 7.3 Implement canvas zoom, pan, grid visibility, grid size controls, snap-to-grid, bounds enforcement, and coordinate display.
- [x] 7.4 Implement element creation and editing for shelves, aisles, walls, entrances, cashiers, points of interest, and beacons according to current layout semantics.
- [x] 7.5 Implement inspector field groups for type, label, category, layout/product metadata, coordinates, dimensions, rotation, access angle, lock state, and validation status.
- [x] 7.6 Implement layer/element list with selection, visibility, lock, type grouping, and validation indicators.
- [x] 7.7 Implement command history for undo/redo across create, move, resize, rotate, delete, category, beacon, and inspector edits.
- [x] 7.8 Implement store-specific assigned beacon selection and duplicate-placement prevention.
- [x] 7.9 Implement layout validation for out-of-bounds elements, overlaps, missing or duplicate beacons, invalid product/layout metadata, and routing-readiness warnings.
- [x] 7.10 Implement save draft, publish/activate, import, export, and mobile preview actions while preserving current layout JSON compatibility.
- [x] 7.11 Preserve legacy/global editor mode until a future OpenSpec change removes it.

## 8. Backend Compatibility and Optional API Gaps

- [x] 8.1 Verify every redesigned page can be implemented with current API responses.
- [x] 8.2 Document any required optional backend compatibility endpoint before implementing it.
- [x] 8.3 Preserve `/api/admin/me`, region, store, beacon, product, recipe, tag, log, and layout API auth boundaries.
- [x] 8.4 Preserve public mobile/customer route behavior and existing layout JSON contracts.
- [x] 8.5 Add backend tests only for real API gaps or regressions introduced by the redesign.

## 9. Verification and Deployment

- [x] 9.1 Add unit tests for validators, API clients, role-aware navigation, form behavior, and editor state commands.
- [x] 9.2 Add component tests for shared shell, tables, forms, dialogs, empty states, error states, and permission states.
- [x] 9.3 Add Playwright smoke tests for dashboard, stores, store detail, beacons, products, recipes, server logs, and editor canvas rendering.
- [x] 9.4 Run existing backend tests and add targeted tests if backend compatibility code changes.
- [x] 9.5 Run existing httpyac auth/RBAC/public-route smoke tests.
- [x] 9.6 Verify public mobile/customer routes remain accessible without Admin Platform login.
- [x] 9.7 Verify non-admin direct access to admin-only pages does not expose protected workflows.
- [x] 9.8 Verify build output is packaged and served correctly by Quarkus.
- [x] 9.9 Update deployment documentation if a frontend build step is added.
- [x] 9.10 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
