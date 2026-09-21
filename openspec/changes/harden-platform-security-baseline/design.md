## Context

Current state (verified in `docs/audit/CODE_AUDIT.md`):

- `k8s/keycloak.yaml` contains a `Secret` with `admin`/`admin` and the client secret, a `ConfigMap` realm with three users and fixed passwords, and a `Deployment` running Keycloak 24.0.5 with `start-dev`, `KC_DB=dev-file`, and no volume. The ingress routes all of `/keycloak`, including the admin console.
- The client `indooro-admin-web` has `directAccessGrantsEnabled: true`; the realm sets neither `bruteForceProtected` nor `passwordPolicy`.
- `V4__user_access_assignments.sql` inserts an active `admin` assignment for subject `11111111-1111-1111-1111-111111111111`; `V5` adds region and store demo assignments when matching data exists.
- `admin/editor.js` lines 279, 286–287, 789, and 880 and `customer/app.js` lines 126, 161, and 235 interpolate untrusted text into `innerHTML`.
- `AuditLogService.log` writes `SYSTEM`/`system` as actor. `RecipeService.createTag/updateTag/archiveTag` and all OpenSearch product/category writes write no audit entry.
- Both exception mappers persist every error; `ApiThrowableExceptionMapper` returns `exception.getMessage()`.
- `PdfExportService.drawVisualShelf` loops from the maximum parsed level down to 1.
- `opensearch` and `dashboards` services are `NodePort`; security plugin disabled.

Constraints: LeoCloud is a shared school cluster; the team controls only the namespace `student-it220209`. Ingress annotations and `NetworkPolicy` support must be verified there. The iOS app is anonymous and cannot carry secrets.

## Goals / Non-Goals

**Goals:** close SEC-01…SEC-05, SEC-07, SEC-10…SEC-13, SEC-15…SEC-17, SEC-20, SEC-21, SEC-24 without changing the public/protected route model.

**Non-Goals:** OpenSearch 3.x upgrade and Quarkus upgrade (blueprint phase 2); iOS App Attest; WAF; replacing the static admin UI.

## Decisions

### D1 Keycloak realm and runtime
- Production uses a realm export **without** `users` and with `bruteForceProtected: true`, `passwordPolicy: "length(12) and notUsername and passwordHistory(3)"`, `sslRequired: external`, client `directAccessGrantsEnabled: false`, redirect URIs and web origins restricted to `https://it220209.cloud.htl-leonding.ac.at`.
- The development realm `keycloak/realm/indooro-realm.json` keeps demo users and ROPC for httpYac; httpYac against LeoCloud switches to the token-based suite (`00-auth-env-tokens.http`).
- Keycloak runs `start` (not `start-dev`) at the latest 26.x patch with `KC_DB=postgres` on a dedicated database `keycloak` in the existing PostgreSQL instance, `KC_HOSTNAME=https://it220209.cloud.htl-leonding.ac.at/keycloak`, `KC_HTTP_ENABLED=true`, `KC_PROXY_HEADERS=xforwarded`, and health endpoints enabled.
- The bootstrap admin and client secret come from a `Secret` created with `kubectl create secret` from a local untracked file; `k8s/keycloak.yaml` references it but no longer defines it.
- The ingress exposes only `/keycloak/realms/` and `/keycloak/resources/`; administration uses `kubectl port-forward`.
- Alternative: keep `start-dev` and change passwords manually. Rejected because the dev-file database is lost on restart and the realm import restores the demo users.

### D2 Demo access assignments
- Flyway placeholder `demoAccess` (`%dev`/`%test` = `true`, default = `false`). `V12__disable_demo_access_outside_dev.sql` sets `status = 'DISABLED'` for the three demo subjects when the placeholder is `false`. Existing migrations stay unchanged (checksums).

### D3 Output encoding and CSP
- The editor and customer page build dynamic nodes with `textContent`/`createElement`; where template strings remain, every interpolated value passes through `escapeHtml` (moved into `editor-core.js` and a new `customer/escape.js`). A Playwright test stores a malicious label and asserts that no `img` element is created.
- `quarkus.http.header` config adds for `/admin/*`, `/customer/*`, and `/`: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, and `Strict-Transport-Security: max-age=31536000` in `%prod`. `'unsafe-inline'` for styles is required by existing inline `style` attributes and is tracked for removal in blueprint phase 3.
- The Tailwind Play CDN is removed; the customer page uses only `customer/style.css` with the utility classes it needs.

### D4 Layout document validation
- `LayoutService.saveCurrentLayout` and `StoreLayoutAdminService.saveLayoutVersion` reject documents larger than 1 MB serialized, with more than 5 000 elements, with non-numeric coordinates or sizes, or with string fields longer than 200 characters (`label`, `beaconId`, `category`). Validation lives in a new `LayoutDocumentValidator` shared by both services.

### D5 Error persistence
- `ErrorLogService` persists all 5xx responses and 4xx responses only for authenticated admin requests; anonymous 4xx are logged at DEBUG. A `@Scheduled` job deletes `error_logs` rows older than 30 days and keeps at most 50 000 rows.
- 5xx responses return `error: "Interner Serverfehler"` and a `correlationId` (UUID) that is also stored in `error_logs.message`. The `ApiErrorResponse` schema gains the optional field `correlationId`.
- The throwable mapper wraps error persistence in `try/catch` like the web-application mapper.

### D6 Audit actor
- `V13__audit_actor_subject.sql` adds `audit_logs.actor_subject VARCHAR(120)`. `AuditLogService.log` resolves the current user through `AdminAccessService` when the identity is not anonymous and stores role, username, and subject; otherwise it stores `SYSTEM`. `StoreLayoutAdminService` and `RecipeService` use the same resolution for `created_by_*`.
- Tag mutations write `RECIPE_TAG` entries; admin product and category writes write `PRODUCT`/`CATEGORY` entries with the numeric id in `summary` (the `entity_id` column is a UUID; a deterministic name-based UUID of the numeric id is used).

### D7 Anonymous throttling and upsell bounds
- Primary control: the application filter `MobileRateLimitFilter` already designed in `modernize-ios-client-architecture` (token bucket per first `X-Forwarded-For` hop): 20 requests per 10 minutes for upsell plan/suggestions, 120 per 10 minutes for events/dismiss, and additionally 10 per minute for `/api/export` and `/api/convert`; 429 with `Retry-After`. This change owns the backend implementation; `modernize-ios-client-architecture` keeps the iOS handling. Ingress annotations (`nginx.ingress.kubernetes.io/limit-rpm`) are added as an outer layer only if LeoCloud honors them (task 1.3).
- Secondary control: SmallRye Fault Tolerance `@Bulkhead(4)` on the OpenAI call path (introduced together with the transaction split in `optimize-backend-data-access`).
- `UpsellPlanRequest.opportunities` gets `@Valid`, `@Size(max = 30)`; list-id fields get `@Size(max = 200)`; anonymous responses keep only `requestId`, `responseSource`, `fallbackReason`, and the retryability flag in `debug` (required by `stabilize-upsell-quality-and-request-lifecycle`); model, token, latency, and candidate diagnostics are returned only for role `admin`.

### D8 Infrastructure
- `opensearch` and `dashboards` services become `ClusterIP`; dashboards replicas default to 0.
- `k8s/network-policy.yaml`: default deny ingress in the namespace; allow ingress-controller → backend:8080 and keycloak:8080; backend → postgres:5432, opensearch:9200; keycloak → postgres:5432.
- Backend image: `eclipse-temurin:21-jre` (matching the compile level chosen in blueprint phase 2), non-root user `10001`, `readOnlyRootFilesystem` with an `emptyDir` on `/tmp`; deployment references the Git SHA tag produced by CI; `livenessProbe` `/q/health/live`, `readinessProbe` `/q/health/ready`.
- `DB_PASSWORD` and `POSTGRES_PASSWORD` come from secret `indooro-postgres-secret`.

## Risks / Trade-offs

- [LeoCloud may not honor `NetworkPolicy` or ingress rate-limit annotations] → verify in task 1.3; fall back to the application filter and document the residual risk.
- [Keycloak migration from dev-file loses the current realm state] → the realm is re-imported from the production export; users are recreated by an admin with temporary passwords.
- [CSP may break editor features] → Playwright smoke tests for all admin routes run with the header enabled.
- [Stricter error persistence hides anonymous abuse] → aggregate counters of anonymous 4xx are logged every minute at INFO.

## Migration Plan

1. Create secrets out-of-band (`indooro-keycloak-secret`, `indooro-postgres-secret`).
2. Deploy PostgreSQL database `keycloak`, then Keycloak 26.x in production mode with the production realm; recreate admin users with temporary passwords; update `user_access_assignments` for their subjects.
3. Deploy backend with V12/V13, headers, validators, and error policy.
4. Apply NetworkPolicy and service type changes; verify from a debug pod and from outside.
5. Rollback: previous backend image tag; Keycloak rollback by redeploying the previous manifest (dev realm) is **not** allowed in production – instead restore the Keycloak database dump taken in step 2.
