## Why

The full-stack audit (`docs/audit/CODE_AUDIT.md`, chapter 2) found exploitable weaknesses that `protect-legacy-write-endpoints` does not cover:

- SEC-01/SEC-03: the LeoCloud Keycloak imports demo users with fixed passwords (`indooro-admin`/`admin` …), runs `start-dev` with a non-persistent `dev-file` database, and uses `admin`/`admin` for the master realm; migration V4 grants the demo admin subject full Indooro admin access.
- SEC-02/SEC-15: the layout editor and the customer web page insert layout labels, beacon ids, store names, and product names into `innerHTML` without escaping. Together with the anonymous legacy layout write this allows an anonymous attacker to run script in an admin session.
- SEC-04/SEC-24: OpenSearch and Dashboards run without security as NodePort services; the database password is in plain text; containers run as root with `:latest` images and no liveness checks.
- SEC-05/SEC-11: the PDF export uses a user-controlled shelf level as a loop bound and the PDF import has no size or page limit.
- SEC-07/SEC-20/SEC-21: every 4xx/5xx writes a stack trace into `error_logs` without retention; 500 responses echo internal exception messages; anonymous upsell responses expose model and token diagnostics.
- SEC-10: audit entries never name the acting user, and tag, product, and category mutations are not audited at all.
- SEC-12/SEC-13/SEC-16/SEC-17: anonymous upsell and event routes have no rate limit and incomplete nested validation; the customer page loads the Tailwind Play CDN at runtime; no security headers are sent.

These gaps allow account takeover, stored XSS, data destruction, cost abuse, and disk exhaustion on the public LeoCloud host and must be closed before the next external demo.

## What Changes

- Ship a production Keycloak setup without preset users or passwords, in production mode with PostgreSQL persistence, without the password grant, with brute-force protection and a password policy, and without a public admin console route. Disable the demo access assignments outside development through a Flyway placeholder.
- Render all untrusted text in the layout editor and customer page through text nodes or `escapeHtml`, validate layout documents on save, and add a Content-Security-Policy and further security headers; replace the Tailwind Play CDN with local CSS.
- Restrict OpenSearch and Dashboards to the namespace with `ClusterIP` services and a `NetworkPolicy`, move database credentials to a secret, run the backend as non-root from a JRE image with an immutable tag, and add health-based probes.
- Bound PDF export and import inputs.
- Persist only 5xx errors plus 4xx errors of authenticated admin requests, add retention, and return generic messages with a correlation id for 5xx.
- Record the acting user in audit entries and audit tag, product, and category mutations.
- Rate-limit anonymous upsell, event, dismissal, and utility routes per client address, validate nested upsell payloads, cap list sizes, and reduce anonymous upsell diagnostics to the fields the iOS retry logic needs.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `backend-core`: audit actor attribution, audit coverage, bounded error persistence, generic 5xx messages, security headers, bounded PDF inputs, anonymous route throttling, upsell payload bounds, admin-only upsell cost diagnostics, layout document validation.
- `admin-dashboard`: untrusted text rendering in the editor.
- `customer-web-experience`: untrusted text rendering and no runtime CDN.
- `keycloak-deployment`: production realm without preset credentials, production-mode Keycloak, hardened client and realm settings, private admin console.
- `deployment-operations`: internal-only search cluster, hardened backend workload, secret-based database credentials.

## Impact

- Backend: `AuditLogService`, `AdminAccessService`, `ApiThrowableExceptionMapper`, `ApiWebApplicationExceptionMapper`, `ErrorLogService`, `PdfExportService`, `PdfImportService`, `StoreLayoutAdminService`, `LayoutService`, `RecipeService` (tags), `AdminProductResource`, `ProductResource`, `CategoryResource`, `UpsellDtos`, `UpsellSuggestionService`, `application.properties`, new Flyway migrations `V12__disable_demo_access_outside_dev.sql` and `V13__audit_actor_subject.sql`, new dependencies `quarkus-smallrye-health` and `quarkus-scheduler`.
- Admin UI: `admin/editor.js`, `admin/editor/index.html`; customer UI: `customer/app.js`, `customer/index.html`, `customer/style.css`.
- Infrastructure: `k8s/keycloak.yaml` (split into realm/secret handling), `k8s/opensearch.yaml`, `k8s/backend.yaml`, `k8s/postgres.yaml`, `k8s/backend-ingress.yaml`, new `k8s/network-policy.yaml`, `src/main/docker/Dockerfile`, `keycloak/realm/` (dev realm keeps demo users).
- iOS: no code change; `NSAllowsArbitraryLoads` removal stays in `modernize-ios-client-architecture`.
- Protected routes: unchanged from `protect-legacy-write-endpoints`; the Keycloak admin console is no longer publicly routed.
- Public routes: `/api/mobile/**`, catalog and layout reads stay public but are rate-limited where they can write or trigger external cost.
- Roles: unchanged (`admin`, `region-manager`, `store-manager`).
- Demo proof: (1) login with `indooro-admin`/`admin` on LeoCloud fails; (2) a layout with label `<img src=x onerror=alert(1)>` renders as text in editor and customer page; (3) `curl` from outside the namespace cannot reach OpenSearch; (4) a PDF export with `layoutCode` `1/1/2000000000/1` returns 400 within one second; (5) audit entries show the admin username.
