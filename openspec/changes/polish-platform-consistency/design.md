## Context

Orchestrated change with one worker session per package. Each package owns a disjoint file set (see "Ownership").

## Decisions

### D1 Create response contract
- Single-resource create via `POST`: `201 Created`, header `Location: <absolute or context-relative URI of the GET endpoint>`, empty body. Use `Response.created(uriInfo.getAbsolutePathBuilder().path(id).build())` or an equivalent `UriBuilder` that keeps the public path prefix.
- Upsert `POST` (category upsert, product upsert, admin product upsert): `201` + `Location` on create, `204 No Content` + `Location` on update.
- Sub-resource create (recipe ingredient, recipe step, layout version, access assignment, recipe tag): same rule, `Location` points to the sub-resource `GET`. If no `GET` exists, add one with the same `@RolesAllowed` as the list endpoint.
- Not affected (keep current status and body): bulk endpoints, index create/reindex/activate, export, import, `layout/current` save, beacon assign/release, layout activate, all `/api/mobile/**` endpoints.
- Security annotations stay unchanged or get stricter.

### D2 Client migration
- `admin-ui/src/api/client.ts` gets one helper (for example `createResource<T>(path, body, readPath?)`): send POST; when status is 201/204 and a `Location` header exists, GET that URI and return the entity; when a JSON body exists (old server), return it. Public function signatures stay the same, so pages do not change.
- Expose `Location` in CORS (`quarkus.http.cors.exposed-headers`) if the admin web runs cross-origin anywhere.
- iOS and pilot-showcase do not call create endpoints (checked: iOS only POSTs `/api/mobile/**`). Workers re-check.

### D3 Admin UX
- After store create: navigate to `/stores/:id` (store detail with setup checklist); remove the intermediate success page.
- Tables: wrap in one shared table container; fit by default (hide low-value columns at narrow widths, truncate long ids with tooltip and copy button); horizontal scroll only inside the container with visible affordance, never cut off. No page-level horizontal scroll at 1280 px and 1440 px width.
- Layout editor: editor route uses `height: 100dvh` minus app header; canvas and side panels scroll internally; no document scroll at 1280x800 and 1440x900.
- German UI copy, one verb per action ("Anlegen", "Speichern", "Löschen", "Abbrechen"), consistent primary/secondary button order.

### D4 Verification
- Every UI package attaches before/after screenshots (desktop 1440x900 and 1280x800 for admin; iPhone 17 Pro and smallest supported iPhone for iOS; 375 px and 1440 px for showcase) to the PR description or `docs/polish/` and lists them.

## Ownership

| Package | Owner session | Branch | Files |
|---|---|---|---|
| P1 backend create contract | `polish-backend` | `feat/rest-201-location` | `backend/**`, `api/**`, `api-tests/**`, `admin-ui/src/api/**` |
| P2 admin pages and tables | `polish-admin-pages` | `feat/admin-pages-polish` | `admin-ui/src/**` except `src/api/**`, `src/editor/**`, `EditorRoute.tsx`, `LegacyEditorRoute.*` |
| P3 admin layout editor | `polish-admin-editor` | `feat/admin-editor-viewport` | `admin-ui/src/editor/**`, `EditorRoute.tsx`, `LegacyEditorRoute.*` (no `style.css`) |
| P4 iOS sweep | `polish-ios` | `feat/ios-polish` | `swift/indooro-EinkaeuferFinal/**` |
| P5 web clients sweep | `polish-web` | `feat/web-clients-polish` | `pilot-showcase/**`, `app/**`, `android/*.md` |

Each worker ticks only its own section in `tasks.md`.

## Risks
- Wire-format break for third-party scripts: mitigated by tolerant admin client and updated `api-tests`.
- Deploy order: backend first is safe because the admin client accepts both forms.
