# Admin guide

## Which page to use

The normal `/admin/*` links use the rebuilt pages for Dashboard, Regions, Stores, Store detail, Beacons, Products, Categories, Recipes, and Diagnostics in the local cutover image. The Layout editor still uses its existing page. The React candidate remains directly available under `/admin/next/`. Sign in through the same Keycloak session. Your role and assigned region/store determine which data and actions the server allows.

| Workflow | Current page | Candidate page |
| --- | --- | --- |
| Dashboard | `/admin/` | `/admin/next/` |
| Regions | `/admin/regions/` | `/admin/next/regions/` |
| Stores | `/admin/stores/` | `/admin/next/stores/` |
| Store detail | `/admin/stores/detail/?storeId={uuid}` | `/admin/next/stores/detail/?storeId={uuid}` |
| Create store | From `/admin/stores/` to `/admin/next/stores/new/` | `/admin/next/stores/new/` |
| Beacons | `/admin/beacons/` | `/admin/next/beacons/` |
| Products | `/admin/products/` | `/admin/next/products/` |
| Categories | `/admin/categories/` | `/admin/next/categories/` |
| Recipes | `/admin/recipes/` | `/admin/next/recipes/` |
| Diagnostics | `/admin/server-logs/` | `/admin/next/server-logs/` |
| Layout editor | `/admin/editor/?storeId={uuid}` (store) or `/admin/editor/` (global) | `/admin/next/editor/?storeId={uuid}` (store) or `/admin/next/editor/` (global) |

Store and version deep links may include `layoutId={uuid}`. Keep the `storeId` when sharing a store detail or editor link. A store manager can use only their assigned store; a region manager is limited to their region. Admin-only tools include global layout editing, diagnostics, and catalog/recipe administration. The backend enforces access even when a URL is entered directly.

## Layout editing and publication

In store mode, edits are drafts. **Save draft** creates a version but does not change the layout returned to mobile users. Review version history and compare the saved draft with the read-only mobile preview. The preview shows the public current-layout response and is useful for checking the currently active version; it does not prove that navigation routes are passable. Resolve blocking validation errors before publishing. **Publish/activate** is a separate confirmed action; it makes that version current for the store. Older versions remain in history.

In global mode (admin only), the legacy/global layout has no store draft activation workflow: saving writes the current global layout immediately. It affects the public global current-layout endpoint. Check the confirmation and resulting version history carefully.

The editor supports layout element editing, undo/redo, validation, version history, and mobile preview. **JSON exportieren** downloads the current editor document without saving it to the server. This is a deliberate change from the old page, whose export also creates a private Store draft; save explicitly if the server should retain the edit. **JSON importieren** accepts a layout file up to 5 MB, checks its structure, and makes the import an undoable unsaved edit. Review validation findings, then save a draft or publish in the appropriate mode. A missing entrance permits a private draft but blocks publication in the new editor because the map cannot satisfy its navigation assumptions. Validation can identify geometry and metadata issues, but routing readiness is heuristic and cannot establish that every mobile path works. Use the current page for release work until route parity is accepted.

## Other staff workflows

- **Stores and regions:** use list filters and detail pages to inspect scope, metadata, assigned beacons, layout versions, and audit information. Region creation and changes are admin-only.
- **Beacons:** review identity values before creating or assigning; UUID/major/minor identities must be valid and unique. Store managers are limited to their assigned store.
- **Products and categories:** create or edit individual records and inspect product readiness/category context. Product search, readiness filtering, and Name/ID/Layout-Code sorting run across the full server result before pagination. “Routbar” here means only that the Layout-Code has the legacy four-part numeric format; it does not prove a reachable shelf or route in the published mobile map. Catalog bulk import currently supports parsing and row review only; its commit action is disabled because partial writes, ambiguous transport responses, and overwrites are not yet safely reconciled.
- **Recipes:** review metadata, tags, ingredients, steps, product mappings, and preview before publishing or deactivating. Recipe updates may involve several API writes; a failure partway through can leave some stages saved, so reload and inspect the recipe before retrying.
- **Diagnostics:** admin-only audit and error-log views.

Candidate UI behavior may change while parity work continues. Report failures with the route, role, store/region scope, and action taken. Avoid including credentials in reports.

## Screenshots

These are examples of the candidate UI, not proof that every route is released:

- Dashboard: [dashboard.png](screenshots/dashboard.png)
- Products: [products.png](screenshots/products.png)
- Store editor: [store-editor.png](screenshots/store-editor.png)
- Selected shelf properties in the live store editor: [store-editor-inspector.png](screenshots/store-editor-inspector.png)
- Store editor on a narrow screen: [store-editor-mobile.png](screenshots/store-editor-mobile.png)
- Global editor: [global-editor.png](screenshots/global-editor.png)

