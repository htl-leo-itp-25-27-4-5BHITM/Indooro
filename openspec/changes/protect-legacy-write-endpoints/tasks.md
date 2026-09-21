## 1. Preparation

- [ ] 1.1 Confirm with httpYac that anonymous `POST /api/layout/current`, `POST /api/convert/pdf-to-json`, `POST /api/export/pdf` currently succeed or fail only on payload validation.
- [ ] 1.2 Confirm that a store-manager token can call `DELETE /api/admin/index` in a local environment without OpenSearch data loss (use an empty test index).

## 2. Permissions And Annotations

- [ ] 2.1 Split the public HTTP permission into `public-static` and `public-read` (GET only) in `application.properties`.
- [ ] 2.2 Add the `admin-write` authenticated permission for non-GET methods on `/api/products*`, `/api/categories*`, `/api/layout*`, `/api/convert/*`, `/api/export/*`.
- [ ] 2.3 Add `@RolesAllowed("admin")` and `adminAccessService.requireAdmin()` to `LayoutResource.saveCurrentLayout`, `ImportResource.convertPdfToJson`, `ExportResource.exportBelegplanPdf`, `AdminResource.createIndex`, `AdminResource.deleteIndex`, and `AdminResource.health`.
- [ ] 2.4 Add `@PermitAll` to all anonymous read resources and mobile resources.
- [ ] 2.5 Set `%prod.quarkus.security.jaxrs.deny-unannotated-endpoints=true`.
- [ ] 2.6 Delete `ExampleResource` and its tests.
- [ ] 2.7 Write an audit log entry with entity type `LEGACY_LAYOUT`, action `SAVE`, and the admin label in `LayoutService.saveCurrentLayout`.
- [ ] 2.8 Make `OpenSearchService.createIndex()` fail when the index already exists and return HTTP 409 with an error body from `AdminResource.createIndex` (spec scenario „Product index already exists“, finding AUD-35).

## 3. Configuration Hardening

- [ ] 3.1 Move the OIDC client secret default to `%dev` and `%test` profiles and require `OIDC_CLIENT_SECRET` in `%prod`.
- [ ] 3.2 Replace wildcard CORS origins with profile-specific origin lists.
- [ ] 3.3 Set HTTP body and form attribute limits to 10 MB.
- [ ] 3.4 Verify `k8s/backend.yaml` injects `QUARKUS_OIDC_CREDENTIALS_SECRET` from a Kubernetes secret (already present) and document it.

## 4. Tests

- [ ] 4.1 Add Quarkus tests with `@TestSecurity` for anonymous (401), `store-manager` (403), and `admin` (2xx or validation error) on each protected route.
- [ ] 4.2 Add a Quarkus test proving anonymous `GET /api/layout/current`, `GET /api/products/search?q=milch`, and `GET /api/categories` still succeed.
- [ ] 4.3 Extend `api-tests/httpyac/04-role-route-matrix.http` and `01-public-routes.http` accordingly.

## 5. Documentation And Deployment

- [ ] 5.1 Update `DEPLOYMENT.md` with the required OIDC client secret variable and CORS origins.
- [ ] 5.2 Update `docs/specs/TSD.md` route table.
- [ ] 5.3 Roll out to LeoCloud and run `npm run api:test:public` and `npm run api:test:roles` against the public host.

## 6. Verification

- [ ] 6.1 Run `npx -y @fission-ai/openspec@1.3.1 validate protect-legacy-write-endpoints --strict`.
- [ ] 6.2 Run `./mvnw test` in `backend/indooro_server`.
- [ ] 6.3 Build and launch the iOS app against the deployed backend and confirm store list, layouts, search, recipes, and upsell still work.
