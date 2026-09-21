## Context

`application.properties` currently defines:

```properties
quarkus.http.auth.permission.public.paths=/,/index.html,/assets/*,/media/*,/logos/*,/api/mobile/*,/api/products,/api/products/*,/api/layout,/api/layout/*
quarkus.http.auth.permission.public.policy=permit
quarkus.http.auth.permission.category-read.paths=/api/categories,/api/categories/*
quarkus.http.auth.permission.category-read.methods=GET
quarkus.http.auth.permission.category-read.policy=permit
quarkus.http.auth.permission.admin.paths=/admin,/admin/*,/api/admin/*,/api/regions,/api/regions/*,/api/stores,/api/stores/*,/api/beacons,/api/beacons/*,/api/categories/bulk
quarkus.http.auth.permission.admin.policy=authenticated
```

Product writes already carry `@RolesAllowed("admin")` plus `AdminAccessService.requireAdmin()`. `LayoutResource`, `ImportResource`, `ExportResource`, and `AdminResource` carry no role annotation. Paths not matched by any permission are permitted by Quarkus by default.

## Goals / Non-Goals

**Goals:** close anonymous and under-privileged writes with Quarkus-native mechanisms; keep every iOS and customer read path anonymous.

**Non-Goals:** no Keycloak Authorization Services, no rate limiting (tracked in `modernize-ios-client-architecture`), no change to `/api/mobile/*`.

## Decisions

1. **Method-scoped HTTP permissions plus annotations (defense in depth).** Split the `public` permission into `public-static` (all methods, static assets and `/api/mobile/*`) and `public-read` (`GET` only for `/api/products*`, `/api/categories*`, `/api/layout*`). Add `admin-write` with `policy=authenticated` for `/api/products*`, `/api/categories*`, `/api/layout*`, `/api/convert/*`, `/api/export/*`. Add `@RolesAllowed("admin")` on the four resources' write methods and `AdminAccessService.requireAdmin()` so the role is enforced even if a path permission is misconfigured.
2. **Deny unmatched paths in prod.** Set `%prod.quarkus.security.jaxrs.deny-unannotated-endpoints=true` and annotate the remaining public resources (`ProductResource` GETs, `CategoryResource` GETs, `LayoutResource` GETs, mobile resources, `ExampleResource` removed) with `@PermitAll`.
3. **Secrets.** Replace `quarkus.oidc.credentials.secret=${OIDC_CLIENT_SECRET:indooro-admin-secret}` with `%dev`/`%test` defaults and `%prod.quarkus.oidc.credentials.secret=${OIDC_CLIENT_SECRET}` so a missing variable fails start-up; the existing Kubernetes variable `QUARKUS_OIDC_CREDENTIALS_SECRET` (from a `secretKeyRef` in `k8s/backend.yaml`) still overrides the property directly.
4. **CORS.** `%prod.quarkus.http.cors.origins=https://it220209.cloud.htl-leonding.ac.at`, `%dev.quarkus.http.cors.origins=http://localhost:8080,http://localhost:5173`.
5. **Upload limit.** `quarkus.http.limits.max-body-size=10M` and `quarkus.http.limits.max-form-attribute-size=10M`.

## Auth Coverage Checklist

- Login and logout: unchanged (`quarkus-oidc` hybrid application, `/admin/logout`).
- Unauthorized behavior: anonymous API calls receive 401 JSON, authenticated users without `admin` receive 403 JSON via the existing exception mappers.
- Role-based access: only `admin` may use the routes listed in the proposal.
- Region/store scope filtering: not applicable; the affected routes are global maintenance routes without region or store scope.
- Deployment: the secret referenced by `QUARKUS_OIDC_CREDENTIALS_SECRET` in `k8s/backend.yaml` must exist before rollout.

## Relation To `harden-platform-security-baseline`

This change closes the route-level authorization gaps and sets the global 10 MB body limit. `harden-platform-security-baseline` builds on it and owns content bounds for PDF import/export (pages, item counts, regex hardening), rate limits for `/api/convert` and `/api/export`, security headers, Keycloak production mode, and network policies. Implement this change first.

## Risks / Trade-offs

- `deny-unannotated-endpoints` can block a forgotten read route → the httpYac public-route suite must pass before deploy.
- Legacy tools under `app/` break → documented as intended.

## Migration Plan

1. Implement and run `./mvnw test`.
2. Run `npm run api:test` locally against Keycloak.
3. Verify the secret referenced by `QUARKUS_OIDC_CREDENTIALS_SECRET` exists in namespace `student-it220209`, then roll out `deployment/indooro-backend-v2`.
4. Rollback: redeploy the previous image tag; properties are part of the image.
