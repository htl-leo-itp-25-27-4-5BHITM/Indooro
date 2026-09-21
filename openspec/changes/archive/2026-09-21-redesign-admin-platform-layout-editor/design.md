## Context

This change is planning-only until the apply phase. It creates a complete target concept for replacing the current Admin Platform and layout editor experience while preserving Indooro's backend APIs, Keycloak/OIDC protection, role/scope rules, mobile/iOS behavior, and layout JSON compatibility.

### Current State Reviewed

OpenSpec and project documentation reviewed:

- `openspec/specs/admin-platform-management/spec.md`
- `openspec/specs/store-layout-management/spec.md`
- `openspec/specs/admin-authentication/spec.md`
- `openspec/specs/admin-role-access-control/spec.md`
- `openspec/specs/catalog-maintenance-operations/spec.md`
- `openspec/specs/product-catalog-search/spec.md`
- `openspec/specs/domain-model/spec.md`
- `openspec/specs/deployment-operations/spec.md`
- `openspec/specs/project-overview/spec.md`
- `openspec/changes/split-admin-platform-pages/*`
- `openspec/changes/add-recipe-shopping-list-integration/*`
- `documentation/SPRINT_ADMIN_PLATFORM_COMPLETE_DOCUMENTATION.md`
- `documentation/API_DOCUMENTATION.md`
- `documentation/RUNTIME_OBJECT_DIAGRAM_DATABASE.md`
- `documentation/KEYCLOAK_AUTH_VERIFICATION.md`
- `README.md`

Admin/frontend files reviewed:

- `backend/indooro_server/src/main/resources/META-INF/resources/admin/index.html`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/regions/index.html`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/stores/index.html`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/stores/detail/index.html`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/beacons/index.html`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/products/index.html`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/recipes/index.html`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/app.js`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/app.css`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/editor/index.html`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/editor.js`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/editor.css`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/server-logs/index.html`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/server-logs/server-logs.js`
- `backend/indooro_server/src/main/resources/META-INF/resources/admin/server-logs/server-logs.css`

Backend/API files reviewed:

- `backend/indooro_server/src/main/java/at/htl/resource/admin/*Resource.java`
- `backend/indooro_server/src/main/java/at/htl/admin/service/AdminAccessService.java`
- `backend/indooro_server/src/main/java/at/htl/admin/service/StoreLayoutAdminService.java`
- `backend/indooro_server/src/main/java/at/htl/admin/dto/LayoutDtos.java`
- `backend/indooro_server/src/main/java/at/htl/admin/dto/StoreDtos.java`
- `backend/indooro_server/src/main/java/at/htl/admin/dto/BeaconDtos.java`
- `backend/indooro_server/src/main/resources/application.properties`
- `backend/indooro_server/pom.xml`
- `.github/workflows/ci.yaml`
- `api-tests/httpyac/*`

### Current Strengths

- The backend domain model is coherent: regions, stores, beacons, assignments, layout versions, audit logs, error logs, user access assignments, recipes, and product search are separated cleanly.
- Admin APIs already provide scoped list/detail/mutation paths for regions, stores, beacons, layout versions, products, recipes, tags, logs, and current user.
- Keycloak/OIDC protection and role/scope checks are already in the backend; the redesign can reuse them.
- Store-specific layout versioning exists and the editor can save against `/api/stores/{storeId}/layout/versions`.
- Recipe admin APIs and mapping suggestions exist in code, with the active recipe OpenSpec change still in progress.
- The earlier `split-admin-platform-pages` change moved away from hash navigation and established real URLs under `/admin/...`.

### Current UX and Technical Problems

- The current subpage files are identical copies of the same 565-line HTML document. The URLs are real, but the implementation still behaves like a hidden onepage.
- `app.js` is a 1,647-line monolith that eagerly queries all DOM nodes, loads broad bootstrap data, and binds every workflow regardless of the current page.
- `app.css` contains duplicated token definitions and a hard `min-width` around desktop dimensions, which blocks responsive behavior and encourages horizontal layouts.
- Forms for stores, beacons, products, and recipes are visible as side-by-side panels near lists instead of being treated as focused create/edit workflows.
- Critical actions use browser `confirm()` and do not provide domain-specific confirmation UI, recovery guidance, or strong post-action context.
- Products are rendered as card/list items without true table density, search/filter/sort depth, pagination, or layout-readiness scanning.
- Recipe editing mixes metadata, ingredients, steps, and mapping into one card rather than a proper detail workflow with preview/readiness.
- The editor uses Tailwind via CDN, custom CSS overrides, inline utility classes, emoji/manual SVG controls, and DOM-generated property panels. It has useful behavior but not a cohesive tool architecture.
- The editor lacks a true layer/element list, full validation panel, explicit save versus publish split, mobile preview flow, and robust undo/redo state boundaries.
- Server logs are a separate page but do not share the main shell or navigation model.
- Automated UI tests are effectively absent; only placeholder Java tests were found under `backend/indooro_server/src/test`.

### Assumptions

- The redesign targets staff desktop/notebook use first, but ordinary admin pages must remain usable on narrower tablet-sized viewports.
- The existing backend APIs should be reused wherever possible. API changes are allowed only when a page cannot be implemented safely with current contracts.
- Product/category/recipe data models remain as currently implemented or specified by active OpenSpec changes.
- No mobile/iOS code changes are part of the MVP for this Admin Platform redesign.
- The active `split-admin-platform-pages` change is treated as baseline intent, but its current implementation still needs deeper restructuring.
- The active `add-recipe-shopping-list-integration` change remains the source of durable recipe feature details until it is archived into permanent specs.

## Goals / Non-Goals

**Goals:**

- Make the Admin Platform feel like a modern, calm, professional SaaS/operations tool.
- Replace the onepage-feeling implementation with a deliberate information architecture.
- Preserve existing protected backend functionality and role/scope rules.
- Make list, detail, edit, import, assignment, publish, and archive workflows explicit.
- Redesign the layout editor as a real planning tool with toolbar, canvas, inspector, layers, validation, preview, and versioning.
- Establish a reusable design system and frontend architecture that is maintainable.
- Provide a phased migration plan with MVP scope and later scope.

**Non-Goals:**

- No production code changes in this planning turn.
- No Keycloak realm/client redesign.
- No backend role model replacement.
- No mobile/iOS behavior change.
- No customer web redesign except preserving route compatibility.
- No live inventory, analytics, Android parity, multi-floor routing, or server-side customer tracking.
- No removal of legacy/global layout mode unless a future change explicitly scopes that migration.

## Decisions

### 1. Target information architecture

Use a left navigation shell with optional top utility bar. The shell contains current user, role/scope, logout, page title, breadcrumbs, and page-scoped actions.

Target pages:

- `/admin/` - Dashboard
- `/admin/regions/` - Region list and detail/edit entry
- `/admin/stores/` - Store list
- `/admin/stores/new/` - Guided store creation
- `/admin/stores/:storeId/` or existing-compatible `/admin/stores/detail/?storeId=<id>` - Store detail
- `/admin/stores/:storeId/layouts/` - Store layout versions
- `/admin/beacons/` - Beacon inventory
- `/admin/beacons/assign/` - Guided assignment workflow, optionally with `storeId` or `beaconId`
- `/admin/products/` - Product catalog list
- `/admin/products/import/` - Bulk/import review
- `/admin/categories/` - Category management if category write UX is implemented
- `/admin/recipes/` - Recipe list
- `/admin/recipes/:recipeId/` - Recipe detail editor
- `/admin/recipes/:recipeId/mapping/` - Ingredient product mapping workflow
- `/admin/editor/` - Legacy/global editor mode
- `/admin/editor/?storeId=<id>` - Store-specific editor mode
- `/admin/server-logs/` - Diagnostics

Existing static URLs can remain as compatibility routes during migration. If a SPA router is introduced, Quarkus must serve the SPA fallback for protected `/admin/*` paths or generate static directory fallbacks for each route.

Alternative considered: keep only the existing static multi-page folders and improve CSS. Rejected for the long-term target because it would not solve shared state, duplicated HTML, editor complexity, or testing.

### 2. Target admin workflows

Store creation:

1. Choose region and identity.
2. Enter address and coordinates.
3. Review scope, validation, and optional notes.
4. Save and land on store detail with next actions: assign beacons or create layout.

Beacon assignment:

1. Start from beacon list or store detail.
2. Choose free beacon or target store.
3. Validate UUID/major/minor and current assignment.
4. Confirm assignment.
5. Return to store detail or beacon detail with success state.

Layout create/publish:

1. Start from store detail or layout versions.
2. Open editor with store context.
3. Edit draft using canvas/tooling.
4. Run validation.
5. Preview mobile/routing readiness.
6. Save draft or publish/activate version.
7. Return to layout versions or store detail.

Product import:

1. Select file or source.
2. Parse and preview rows.
3. Validate required fields, layout codes, store fields, duplicates, and conflicts.
4. Commit import.
5. Show saved/skipped/failed summary with retry/download options.

Recipe creation:

1. Enter metadata and tags.
2. Add ingredients.
3. Add ordered steps.
4. Map ingredients to products.
5. Preview mobile readiness.
6. Publish or keep draft.

Mapping correction:

1. Open unresolved/ambiguous mapping queue.
2. Review suggestions with confidence/reason.
3. Search/select product manually.
4. Confirm mapping and routability.
5. Return to recipe readiness.

### 3. Target layout editor model

Editor structure:

- Top toolbar: select, move, draw/add, edit, delete, undo, redo, zoom, pan, snap, grid, validate, preview, save draft, publish.
- Left panel: element library, templates, assigned beacons, product/category placement helpers.
- Center: full-height canvas stage with grid, rulers/scale, pan/zoom, selection handles, snapping, and validation overlays.
- Right panel: inspector for selected element.
- Bottom/status bar: coordinates, zoom, element count, validation count, save state, active mode.
- Optional side list: layers/elements grouped by type, visibility, lock, warnings.

Interaction behavior:

- Select mode selects elements and shows inspector/layer focus.
- Move mode drags selected elements with snapping and bounds.
- Draw/add mode creates the chosen object type.
- Edit mode exposes transform handles and detailed fields.
- Delete mode requires confirmation for semantic elements.
- Undo/redo must cover create, move, resize, rotate, delete, category assignment, beacon selection, and inspector edits.
- Validation must distinguish blocking errors from warnings.

Canvas technology:

- Preferred implementation if a frontend technology switch is adopted: React + TypeScript with `react-konva`/Konva for canvas stage, layers, transforms, pan/zoom, hit detection, and future extensibility.
- Acceptable fallback if static JS remains: modular vanilla editor state with a dedicated canvas abstraction, but this is higher risk for a professional editor.

### 4. Design system direction

Visual qualities:

- Quiet, clear, professional, dense enough for operations.
- Neutral light surfaces, restrained accent colors, strong hierarchy, no marketing hero sections, no decorative blobs/orbs, no oversized cards.
- 8px or smaller radius for cards/panels unless a component requires otherwise.
- Tables for high-density record scanning; cards only for repeated summary objects or detail groupings where appropriate.
- Icons from a consistent icon library, preferably Lucide if React is adopted.

Core tokens:

- Typography: system UI or bundled Inter-like stack, no viewport-scaled font sizes.
- Spacing: 4px base scale with 8/12/16/24/32 primitives.
- Color roles: background, surface, surface-muted, border, text, text-muted, primary, success, warning, danger, info.
- Elevation: minimal shadows, mostly border and background contrast.
- Status colors: accessible contrast, never color-only.

Core components:

- App shell, sidebar/nav, breadcrumbs, page header, action bar.
- Button variants: primary, secondary, ghost, danger, icon-only with tooltips.
- Inputs, selects, textareas, comboboxes, search fields, filters.
- Tables with pagination, sorting, filters, column actions, empty states.
- Detail layouts with tabs or section navigation.
- Stepper/wizard for complex workflows.
- Dialog/alert-dialog for critical actions.
- Toasts or inline result banners.
- Skeleton/loading, access denied, empty, error, validation summary.
- Permission badge and scope chips.
- Editor toolbar, canvas stage, inspector field groups, layer list, validation panel.

### 5. Technology recommendation

Recommended target: build the Admin Platform and layout editor as a modern SPA using React, Vite, TypeScript, React Router or TanStack Router, TanStack Query, React Hook Form + Zod, TanStack Table, Radix/shadcn-style primitives, Lucide icons, and Konva/react-konva for the editor.

Rationale:

- The current static JS approach is fast to serve but already shows monolithic state, duplicated markup, broad DOM coupling, and no strong component/test boundary.
- The layout editor is complex enough to benefit from typed state, canvas primitives, reusable inspector components, command history, and a real test story.
- Quarkus can still serve built static assets, so backend architecture and deployment host do not need to change.
- The redesign goal is structural, not cosmetic; a component architecture gives the team a cleaner migration target than another static-file reshuffle.

Trade-offs:

- Adds Node/Vite build dependencies and CI/build steps.
- Requires static asset integration into Quarkus packaging.
- Requires careful route fallback or generated protected subpage fallbacks.
- Requires team familiarity with TypeScript/React patterns.

Alternatives considered:

- Keep static HTML/CSS/JS and modularize: lowest deployment risk, but weaker for complex editor interactions, type safety, component reuse, and testing.
- Vue/Nuxt: viable, but no project-specific advantage over React was found.
- SvelteKit: compact and pleasant, but adds a less common stack for many teams.
- Server-rendered Quarkus/Qute admin: strong auth integration, but less suitable for rich editor/canvas interactions and high-interactivity workflows.

### 6. Recommended technical architecture

Frontend source:

- Add an admin frontend workspace, for example `backend/indooro_server/src/main/admin-ui` or top-level `admin-ui`.
- Build output copies to `backend/indooro_server/src/main/resources/META-INF/resources/admin`.
- Remove runtime CDN Tailwind usage from editor pages.

Runtime:

- Quarkus continues serving `/admin/*` and protecting it with existing OIDC policies.
- The SPA calls same-origin APIs with credentials.
- Public `/api/mobile/*`, `/api/products*`, `/api/categories*`, and `/api/layout*` remain public according to current auth config.

State:

- TanStack Query for server state and loading/error/cache invalidation.
- Lightweight local state or Zustand for editor session state and command history.
- Zod schemas for frontend validation mirroring backend constraints.

Testing:

- Unit tests for validators, API clients, route guards, and editor reducers/commands.
- Component tests for forms, tables, empty/error states, and role-aware nav.
- Playwright smoke tests for admin shell routes and editor canvas rendering.
- Existing httpyac tests continue to cover API auth/role boundaries.

## Risks / Trade-offs

- **Frontend build complexity** -> Keep Quarkus static serving unchanged, document commands, wire CI incrementally, and keep rollback to previous static admin assets.
- **Route fallback under protected `/admin/*`** -> Verify Quarkus static behavior early; keep directory `index.html` fallbacks if needed.
- **Scope/security regression** -> Treat backend role/scope checks as enforcement, reuse `/api/admin/me`, and test non-admin navigation plus direct URL access.
- **Editor data compatibility regression** -> Add fixture-based tests for layout JSON before and after editor save.
- **Overbuilding the MVP** -> Limit MVP to shell, core pages, reusable components, editor workspace, validation, and API-compatible flows; defer advanced analytics, collaboration, and multi-floor design.
- **Active OpenSpec overlap** -> Coordinate with `split-admin-platform-pages` and `add-recipe-shopping-list-integration`; archive or rebase completed changes before implementation where practical.
- **Team learning curve** -> Use conventional React/Vite patterns and keep backend contracts stable.
- **Visual inconsistency during migration** -> Use a temporary route or feature branch until all admin pages in the MVP use the new shell.

## Migration Plan

1. Freeze current Admin Platform behavior with screenshots, route inventory, API inventory, and smoke tests.
2. Create the new admin frontend structure and build pipeline without changing the deployed routes.
3. Implement shared shell, design tokens, primitives, API client, auth/current-user loading, and role-aware navigation.
4. Rebuild dashboard, stores, store detail, regions, beacons, products, recipes, and server logs one page at a time.
5. Rebuild the layout editor with the new tool architecture while preserving layout JSON and store-specific API behavior.
6. Run old/new route smoke tests, role/scope checks, editor save/load checks, and public mobile/customer route checks.
7. Cut over `/admin/*` to the redesigned assets.
8. Remove duplicated legacy admin page files only after equivalent coverage passes.

Rollback:

- Keep previous static admin files restorable from git during implementation.
- If the SPA build fails in deployment, restore the previous `META-INF/resources/admin` static assets and rebuild the backend image.
- Avoid backend schema migrations for the MVP so rollback does not require database changes.

## MVP Scope

- New Admin Shell with role-aware left navigation, page headers, breadcrumbs, user/scope/logout, responsive behavior.
- Dashboard with operational KPIs, setup warnings, recent audit events, and quick actions.
- Store list, store detail, guided store create/edit, layout versions, beacon assignments, audit tab.
- Beacon list, free/assigned filters, guided assignment/release/archive flows.
- Product list/detail/edit, basic category context, layout-code readiness, delete confirmation.
- Product import review flow if the current backend write routes can support it safely.
- Recipe list/detail/edit, ingredients, steps, mapping status, mapping suggestions, publish/deactivate/archive, preview/readiness.
- Layout editor workspace with toolbar, canvas, inspector, layers/element list, zoom/pan/grid/snap, undo/redo, validation, save draft/publish, mobile preview.
- Shared loading, empty, error, access-denied, validation, and success states.
- Build/deployment documentation and route smoke tests.

## Later Scope

- Full catalog import rollback/versioning if backend support is expanded.
- Category-specific product lookup route if needed for advanced catalog workflows.
- Multi-floor layout editing.
- Collaborative editing or live presence.
- Audit diff visualization for all admin entities.
- Advanced recipe mapping automation, synonyms UI, nutrition/allergen support.
- Admin global search across stores, beacons, products, recipes, and logs.
- Analytics and operational dashboards beyond simple status/readiness.
- Decommissioning legacy/global layout mode.

## Acceptance Criteria

- Admin Platform has clear navigation and real, focused subpages or route modules.
- Existing Admin Platform functionality remains available.
- Layout editor is planned and implemented as a dedicated tool with toolbar, canvas, inspector, layers/list, validation, and version controls.
- Complex workflows are step-by-step where appropriate.
- Forms are grouped or stepped and no longer presented as wide horizontal form walls.
- Lists/tables have search, filter, sort where useful, pagination where needed, and meaningful empty states.
- Role/auth behavior remains correct and backend APIs remain the enforcement boundary.
- Backend APIs remain compatible unless explicitly specified in a future delta.
- Mobile/iOS functionality remains untouched and public routes stay public.
- Build and tests run locally and in CI or documented deployment flow.
- OpenSpec validation passes.
- The redesigned Admin UI is visually and structurally unrecognizable from the current UI while preserving the same business capabilities.

## Open Questions

- Should implementation cut over directly at `/admin/`, or first ship behind a temporary protected `/admin-next/` path for review?
- Should store detail keep the existing query route `/admin/stores/detail/?storeId=<id>` permanently, or should the SPA add cleaner path routes while keeping query-route redirects?
- Does the team prefer a top-level `admin-ui` workspace or a nested backend admin UI source directory?
- Are product/category bulk import APIs sufficient for the desired review/commit workflow, or is a small backend preview endpoint needed later?
- Should layout draft save be a true inactive draft version by default, or should the current always-activate behavior remain for MVP compatibility?
