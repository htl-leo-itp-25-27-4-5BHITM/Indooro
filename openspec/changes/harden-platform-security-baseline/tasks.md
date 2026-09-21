## 1. Preparation

- [ ] 1.1 Confirm with the team whether the LeoCloud Keycloak passwords were changed manually; if not, rotate them immediately through the admin console before any other task.
- [ ] 1.2 Take a dump of the current LeoCloud PostgreSQL database and export the current Keycloak realm (`kc.sh export` via `kubectl exec`).
- [ ] 1.3 Verify on LeoCloud whether `NetworkPolicy` objects and `nginx.ingress.kubernetes.io/limit-rpm` annotations are enforced; record the result in `design.md`.
- [ ] 1.4 Decide with the product owner whether store managers may archive their store and change beacon identities (SEC-14) and record the decision in `admin-role-access-control` through a follow-up delta if it changes.

## 2. Keycloak

- [ ] 2.1 Create `k8s/keycloak-realm-prod.json` without `users`, with `bruteForceProtected`, `passwordPolicy`, `sslRequired: external`, and client `indooro-admin-web` without direct access grants and without `localhost` URIs.
- [ ] 2.2 Rewrite `k8s/keycloak.yaml` for the latest Keycloak 26.x with `start`, `KC_DB=postgres`, `KC_HOSTNAME`, `KC_PROXY_HEADERS=xforwarded`, health enabled, and secret references only; remove the inline `Secret`.
- [ ] 2.3 Create database `keycloak` and user in PostgreSQL through an init job or documented `psql` commands.
- [ ] 2.4 Restrict the Keycloak ingress to `/keycloak/realms/` and `/keycloak/resources/`.
- [ ] 2.5 Add `V12__disable_demo_access_outside_dev.sql` using the Flyway placeholder `demoAccess`; set `quarkus.flyway.placeholders.demoAccess=false`, `%dev.…=true`, `%test.…=true`.
- [ ] 2.6 Switch `npm run api:test` against LeoCloud to the token-based suites and document it in `api-tests/httpyac/README.md`; add the missing `.env.example`.

## 3. Output Encoding and Headers

- [ ] 3.1 Move `escapeHtml` into `admin/editor-core.js` and use it or `textContent` for every interpolated value in `admin/editor.js` (lines 279, 286–287, 789, 880 and all `data-*` ids).
- [ ] 3.2 Replace `innerHTML` interpolation in `customer/app.js` with DOM construction or escaping.
- [ ] 3.3 Remove the Tailwind Play CDN from `customer/index.html` and add the required classes to `customer/style.css`.
- [ ] 3.4 Add `quarkus.http.header` configuration for Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy`, and `%prod` HSTS.
- [ ] 3.5 Send the same CSP from `scripts/serve-admin-smoke.mjs` and add a Playwright test that stores a malicious label and asserts literal rendering and no console CSP violations.

## 4. Backend Hardening

- [ ] 4.1 Add `LayoutDocumentValidator` and call it from `LayoutService.saveCurrentLayout` and `StoreLayoutAdminService.saveLayoutVersion`.
- [ ] 4.2 Bound `PdfExportService` inputs (products, name length, level/position/meter ranges) and replace unencodable characters.
- [ ] 4.3 Bound `PdfImportService` inputs (10 MB, 50 pages) and replace the `DOTALL` item regex with line-based parsing with bounded numeric groups.
- [ ] 4.4 Change `ErrorLogService` and both exception mappers to persist only 5xx and authenticated admin 4xx, return generic 5xx messages with `correlationId`, and guard persistence with `try/catch`.
- [ ] 4.5 Add `quarkus-scheduler` and a daily retention job for `error_logs` (30 days, 50 000 rows).
- [ ] 4.6 Add `V13__audit_actor_subject.sql` and resolve the acting user in `AuditLogService`, `StoreLayoutAdminService`, and `RecipeService`.
- [ ] 4.7 Audit recipe tag, admin product, and category mutations.
- [ ] 4.8 Add `@Valid` and size limits to `UpsellPlanRequest` and `UpsellSuggestionRequest`; reduce `debug` to `requestId`, `responseSource`, `fallbackReason`, and retryability for non-admin requests.
- [ ] 4.9 Implement `MobileRateLimitFilter` with the limits shared with `modernize-ios-client-architecture` (and optional ingress annotations per task 1.3); mark `modernize-ios-client-architecture` task 13.1 as delivered by this change.

## 5. Infrastructure

- [ ] 5.1 Change `opensearch` and `dashboards` services to `ClusterIP`, set dashboards replicas to 0, and add `k8s/network-policy.yaml`.
- [ ] 5.2 Create secret `indooro-postgres-secret` and reference it from `k8s/postgres.yaml` and `k8s/backend.yaml`.
- [ ] 5.3 Switch the Dockerfile to a JRE base image with a non-root user; add `securityContext`, `/tmp` `emptyDir`, and the CI SHA image tag to `k8s/backend.yaml`; change the backend service to `ClusterIP`.
- [ ] 5.4 Add `quarkus-smallrye-health` and replace TCP probes with `/q/health/live` and `/q/health/ready`.
- [ ] 5.5 Delete the unreferenced `k8s/volume-claim.yaml`.

## 6. Tests

- [ ] 6.1 Add Quarkus tests for audit actor attribution, tag/product/category audit entries, error persistence policy, generic 5xx body, layout validation limits, PDF bounds, upsell nested validation, and reduced anonymous diagnostics.
- [ ] 6.2 Add `node --test` cases for `escapeHtml` usage in editor helpers.
- [ ] 6.3 Run `npm run admin:verify` with the CSP-enabled smoke server.

## 7. Documentation and Deployment

- [ ] 7.1 Update `DEPLOYMENT.md` (secrets, Keycloak production mode, port-forward administration, NetworkPolicy, image tags).
- [ ] 7.2 Update `docs/audit/CODE_AUDIT.md` with the resolution status of each SEC finding.
- [ ] 7.3 Roll out to LeoCloud in the order of the migration plan and record image tags and commands.

## 8. Verification

- [ ] 8.1 Demonstrate that `indooro-admin`/`admin` cannot log in on LeoCloud and that `/keycloak/admin/` is not publicly reachable.
- [ ] 8.2 Demonstrate that OpenSearch is unreachable from outside the namespace.
- [ ] 8.3 Demonstrate that the malicious-label layout renders literally in editor and customer page.
- [ ] 8.4 Demonstrate that the oversized PDF export returns 400 within one second.
- [ ] 8.5 Run `./mvnw test`, `npm run admin:verify`, `npm run api:test:roles:tokens`, and `npx -y @fission-ai/openspec@1.3.1 validate harden-platform-security-baseline --strict`.
