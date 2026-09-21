## Baseline Notes

Date: 2026-05-27

### Active Change Coordination

- `split-admin-platform-pages` established real `/admin/.../` URLs, but the current implementation still duplicates the same full HTML shell across subpage folders. This implementation preserves the URL intent while replacing duplicated documents with a shared static loader.
- `add-recipe-shopping-list-integration` remains the recipe feature source. The redesigned recipe admin uses existing recipe APIs and does not change mobile recipe/shopping-list contracts.

### Current Admin Baseline

- Admin assets live in `backend/indooro_server/src/main/resources/META-INF/resources/admin`.
- `index.html`, `regions/index.html`, `stores/index.html`, `stores/detail/index.html`, `beacons/index.html`, `products/index.html`, and `recipes/index.html` were identical full documents before the redesign.
- `app.js` was a monolithic script that initialized broad workflows and data dependencies regardless of page.
- `app.css` used a desktop-oriented layout with weak component boundaries.
- `server-logs/` used a separate shell instead of the Admin Platform navigation.
- `editor/index.html` used Tailwind from a CDN and mixed utility classes with local editor CSS.

### Route Inventory

- `/admin/` -> operations dashboard.
- `/admin/regions/` -> region list and edit/archive workflow.
- `/admin/stores/` -> store list and guided create/edit workflow.
- `/admin/stores/detail/?storeId=<id>` -> store detail, beacons, layout versions, audit history.
- `/admin/beacons/` -> beacon inventory, create/bulk, assign/release/archive.
- `/admin/products/` -> product catalog, readiness, create/edit/delete, product import.
- `/admin/categories/` -> category maintenance and bulk import.
- `/admin/recipes/` -> recipe list/detail editor, ingredients, steps, mappings, publish lifecycle.
- `/admin/editor/` -> legacy/global layout editor.
- `/admin/editor/?storeId=<id>` -> store-specific layout editor.
- `/admin/server-logs/` -> diagnostics inside shared shell.

### API Inventory

- Current user and logs: `/api/admin/me`, `/api/admin/logs`, `/api/admin/error-logs`.
- Regions: `/api/regions`, `/api/regions/{regionId}`, `/api/regions/{regionId}/archive`.
- Stores: `/api/stores`, `/api/stores/{storeId}`, `/api/stores/{storeId}/archive`, `/api/stores/{storeId}/audit`, `/api/stores/{storeId}/beacons`.
- Beacons: `/api/beacons`, `/api/beacons/free`, `/api/beacons/bulk`, `/api/beacons/{beaconId}`, `/api/beacons/{beaconId}/assign`, `/api/beacons/{beaconId}/release`, `/api/beacons/{beaconId}/archive`.
- Products/categories: `/api/admin/products`, `/api/admin/products/{id}`, `/api/products/bulk`, `/api/categories`, `/api/categories/bulk`.
- Recipes/tags: `/api/admin/recipes`, `/api/admin/recipes/{recipeId}`, `/api/admin/recipes/{recipeId}/publish`, `/api/admin/recipes/{recipeId}/deactivate`, `/api/admin/recipes/{recipeId}/archive`, ingredient/step/mapping subroutes, `/api/admin/recipe-tags`.
- Layouts: `/api/stores/{storeId}/layout/current`, `/api/stores/{storeId}/layout/versions`, `/api/stores/{storeId}/layout/versions/{layoutId}`, `/api/stores/{storeId}/layout/versions/{layoutId}/activate`, `/api/stores/{storeId}/layout/editor-context`, legacy `/api/layout/current`.

### Technology Decision

The implementation keeps the Quarkus-served static frontend and modernizes it with native ES modules, shared pure helpers, local tests, and a reusable design system. React/Vite remains a valid later migration path, but this step avoids adding a new package/build pipeline while the current backend already serves protected admin assets reliably.

The target source location remains:

- Runtime assets: `backend/indooro_server/src/main/resources/META-INF/resources/admin`.
- Shared pure helpers: `admin/core.js` and `admin/editor-core.js`.
- Browser entry points: `admin/app.js` and `admin/editor.js`.
- Node tests: `backend/indooro_server/src/test/js`.

### Deployment Notes

- No frontend compile output is introduced. Quarkus packaging continues to include the static Admin Platform directly from `META-INF/resources/admin`.
- Local validation scripts use Node syntax checks and Node test runner for pure frontend helpers.
- The editor no longer depends on Tailwind CDN at runtime.
