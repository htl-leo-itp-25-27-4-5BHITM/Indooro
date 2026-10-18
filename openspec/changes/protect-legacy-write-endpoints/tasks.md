## 1. Preparation

- [x] 1.1 Baseline check is obsolete because the routes are now protected. Evidence for the protected state: `LegacyWriteSecurityMatrixTest.anonymousWriteIsUnauthorized` asserts anonymous `POST /api/layout/current`, `/api/convert/pdf-to-json`, `/api/export/pdf` return 401.
- [x] 1.2 Store-manager `DELETE /api/admin/index` is rejected with 403 before any OpenSearch call. Evidence: `AdminIndexResourceTest.storeManagerCannotMutateProductIndex` (OpenSearch mocked, `verify(never()).deleteIndex()`), so no data is at risk.

## 2. Permissions And Annotations

- [x] 2.1 Split the public HTTP permission into `public-static` and `public-read` (GET only) in `application.properties`. (implemented in release-pilot-backend)
- [x] 2.2 Add the `admin-write` authenticated permission for non-GET methods on `/api/products*`, `/api/categories*`, `/api/layout*`, `/api/convert/*`, `/api/export/*`. (implemented in release-pilot-backend)
- [x] 2.3 Add `@RolesAllowed("admin")` and `adminAccessService.requireAdmin()` to `LayoutResource.saveCurrentLayout`, `ImportResource.convertPdfToJson`, `ExportResource.exportBelegplanPdf`, `AdminResource.createIndex`, `AdminResource.deleteIndex`, and `AdminResource.health`. (implemented in release-pilot-backend)
- [x] 2.4 Add `@PermitAll` to all anonymous read resources and mobile resources. (implemented in release-pilot-backend)
- [x] 2.5 Set `%prod.quarkus.security.jaxrs.deny-unannotated-endpoints=true`. (implemented in release-pilot-backend)
- [x] 2.6 Delete `ExampleResource` and its tests. (implemented in release-pilot-backend)
- [x] 2.7 Write an audit log entry with entity type `LEGACY_LAYOUT`, action `SAVE`, and the admin label in `LayoutService.saveCurrentLayout`. (implemented in release-pilot-backend)
- [x] 2.8 Make `OpenSearchService.createIndex()` fail when the index already exists and return HTTP 409 with an error body from `AdminResource.createIndex` (spec scenario „Product index already exists“, finding AUD-35). (implemented in release-pilot-backend)

## 3. Configuration Hardening

- [x] 3.1 Move the OIDC client secret default to `%dev` and `%test` profiles and require `OIDC_CLIENT_SECRET` in `%prod`. (implemented in release-pilot-backend)
- [x] 3.2 Replace wildcard CORS origins with profile-specific origin lists. (implemented in release-pilot-backend)
- [x] 3.3 Keep HTTP body limit at 14 MB (admin underlay is 10 MB Base64-encoded in JSON, about 13.4 MiB); form attribute limit unchanged, no form uploads exist. (implemented in release-pilot-backend, deviation from 10 MB)
- [x] 3.4 Verify `k8s/backend.yaml` injects `QUARKUS_OIDC_CREDENTIALS_SECRET` from a Kubernetes secret (already present) and document it. (implemented in release-pilot-backend)

## 4. Tests

- [x] 4.1 Add Quarkus tests with `@TestSecurity` for anonymous (401), `store-manager` (403), and `admin` (2xx or validation error) on each protected route. (implemented in release-pilot-backend)
- [x] 4.2 Add a Quarkus test proving anonymous `GET /api/layout/current`, `GET /api/products/search?q=milch`, and `GET /api/categories` still succeed. (implemented in release-pilot-backend)
- [x] 4.3 Extend `api-tests/httpyac/04-role-route-matrix.http` and `01-public-routes.http` accordingly. (implemented in release-pilot-backend)

## 5. Documentation And Deployment

- [x] 5.1 Update `DEPLOYMENT.md` with the required OIDC client secret variable and CORS origins. (implemented in release-pilot-backend)
- [x] 5.2 Update `docs/specs/TSD.md` route table. (implemented in release-pilot-backend)
- [ ] 5.3 (Mensch: LeoCloud-Zugang und Admin-Token nötig) Roll out to LeoCloud and run `npm run api:test:public` and `npm run api:test:roles` against the public host.

## 6. Verification

- [x] 6.1 Run `npx -y @fission-ai/openspec@1.3.1 validate protect-legacy-write-endpoints --strict`.
- [x] 6.2 Run `./mvnw test` in `backend/indooro_server` (404 tests, 0 failures, 0 errors).
- [ ] 6.3 (Mensch: Xcode-Build gegen das deployte Backend nötig) Build and launch the iOS app against the deployed backend and confirm store list, layouts, search, recipes, and upsell still work.
