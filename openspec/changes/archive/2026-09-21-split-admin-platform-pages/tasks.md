## 1. OpenSpec and Baseline

- [x] 1.1 Create the `split-admin-platform-pages` OpenSpec change.
- [x] 1.2 Add proposal, design, delta spec, and implementation tasks before coding.
- [x] 1.3 Validate the OpenSpec change before final delivery.

## 2. Shared Admin Foundation

- [x] 2.1 Create shared Admin Platform JavaScript helpers for API calls, current user, role checks, formatting, status messages, and navigation.
- [x] 2.2 Replace the hash-based shell with role-aware real-link navigation.
- [x] 2.3 Update shared CSS to a calmer desktop SaaS admin visual system with native system fonts, clear hierarchy, and explicit page states.

## 3. Multi-Page Admin Workflows

- [x] 3.1 Rebuild `/admin/` as the dashboard page with scoped operational counts and workflow entry points.
- [x] 3.2 Add `/admin/regions/` with existing region list, create, edit, and archive behavior.
- [x] 3.3 Add `/admin/stores/` with existing store filters, create, edit, archive, editor links, and detail links.
- [x] 3.4 Add `/admin/stores/detail/?storeId=<id>` with detail loading, beacon assignments, layout versions, audit history, and no-store empty state.
- [x] 3.5 Add `/admin/beacons/` with existing beacon filters, create, bulk create, edit, assign, release, and archive behavior.
- [x] 3.6 Add `/admin/products/` as an admin-only page with existing product list, create/update, and delete behavior.
- [x] 3.7 Add `/admin/recipes/` as an admin-only page with existing recipe list, forms, ingredient/step editing, mapping, publish, deactivate, and archive behavior.

## 4. Existing Dedicated Pages

- [x] 4.1 Update `/admin/server-logs/` styling, navigation, and German copy while preserving error-log diagnostics.
- [x] 4.2 Redesign `/admin/editor/` into a visually distinct editor workspace while preserving element IDs and editor behavior.
- [x] 4.3 Update editor back links so store-specific editor sessions return to `/admin/stores/detail/?storeId=<id>`.

## 5. Copy, Roles, and States

- [x] 5.1 Replace visible German ASCII transliterations with native umlauts and `ß` across Admin Platform pages and scripts.
- [x] 5.2 Ensure non-admin users do not see product, recipe, system-log, or server-log navigation/workflow surfaces.
- [x] 5.3 Add or preserve loading, empty, success, validation-error, API-error, and access-denied states on every page.

## 6. Verification

- [x] 6.1 Run static checks for broken IDs, missing scripts, and remaining hash-navigation links.
- [x] 6.2 Run backend or frontend smoke checks for the new Admin Platform routes.
- [x] 6.3 Run OpenSpec strict validation.
- [x] 6.4 Update task checkboxes to reflect completed implementation work.
