## Why

The security review in `docs/specs/AUDIT.md` (AUD-20 to AUD-22, AUD-30) found write and utility routes that are reachable without the intended authorization:

- `POST /api/layout/current` overwrites the global default layout, which every iOS client uses as fallback, and is anonymous because `/api/layout/*` is in the public permission path.
- `POST /api/convert/pdf-to-json` (multipart upload parsed by PDFBox) and `POST /api/export/pdf` are covered by no permission and are therefore anonymous.
- `POST /api/admin/index/create` and `DELETE /api/admin/index` only require authentication; a store manager can delete the product index.
- Production falls back to the development OIDC client secret `indooro-admin-secret` and allows CORS from any origin including the `authorization` header.

These gaps allow anonymous data destruction and parser abuse on the LeoCloud deployment and must be closed before the next demo or external test.

## What Changes

- Restrict the anonymous `/api/products`, `/api/categories`, and `/api/layout` boundary to `GET`; all non-`GET` methods on these paths require authentication and the `admin` role.
- Require the `admin` role for `POST /api/layout/current`, `POST /api/convert/pdf-to-json`, `POST /api/export/pdf`, `POST /api/admin/index/create`, `DELETE /api/admin/index`, and `GET /api/admin/health`.
- Remove the default OIDC client secret from `application.properties` for the `prod` profile and fail start-up when neither `QUARKUS_OIDC_CREDENTIALS_SECRET` nor `OIDC_CLIENT_SECRET` is provided in `prod`.
- Replace `quarkus.http.cors.origins=*` with an explicit origin list (`https://it220209.cloud.htl-leonding.ac.at`, `http://localhost:8080` in `dev`), keeping native iOS clients unaffected because they do not use CORS.
- Add a request-size limit of 10 MB for multipart uploads.
- Make index creation fail with HTTP 409 when the product index already exists, as the existing `catalog-maintenance-operations` scenario requires (today it only logs a warning and reports success).
- Extend `api-tests/httpyac/04-role-route-matrix.http` with anonymous, store-manager, region-manager, and admin checks for every route listed above.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `admin-authentication`: public routes are read-only for catalog and legacy layout paths.
- `catalog-maintenance-operations`: index creation and reset require the admin role.
- `store-layout-management`: legacy global layout writes require the admin role.
- `pdf-catalog-import`: PDF conversion and export utilities require the admin role and bounded uploads.
- `deployment-operations`: production has no insecure authentication or CORS defaults.

## Impact

- Backend: `application.properties`, `resource/LayoutResource.java`, `resource/ImportResource.java`, `resource/ExportResource.java`, `resource/AdminResource.java`, tests under `src/test/java/at/htl/resource`.
- Admin Platform: the legacy editor mode keeps working for admins because it runs with an authenticated session; non-admin editor users can no longer overwrite the global default layout.
- iOS: unaffected; it only uses `GET` on these paths.
- Legacy web tools under `app/` that call `/api/convert` or `/api/export` without a session stop working; they are legacy and not part of the deployed product.
- Protected routes after the change: `POST|PUT|DELETE /api/products*`, `POST|PUT /api/categories*`, `POST /api/layout/current`, `POST /api/convert/pdf-to-json`, `POST /api/export/pdf`, `/api/admin/*`.
- Public routes after the change: `GET /api/products*`, `GET /api/categories*`, `GET /api/layout*`, `/api/mobile/*` (all methods), `/`, `/index.html`, `/assets/*`, `/media/*`, `/logos/*`, `/images/*`, `/customer/*`.
- Demo proof: httpYac role matrix shows 401 for anonymous and 403 for store-manager on every protected route above, and 2xx for admin.
