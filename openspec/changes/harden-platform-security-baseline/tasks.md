## 1. Preparation

- [ ] 1.1 (Mensch: LeoCloud-Admin-Konsole und Rueckfrage im Team) Confirm with the team whether the LeoCloud Keycloak passwords were changed manually; if not, rotate them immediately through the admin console before any other task.
- [ ] 1.2 (Mensch: kubectl-Zugang zu LeoCloud) Take a dump of the current LeoCloud PostgreSQL database and export the current Keycloak realm (`kc.sh export` via `kubectl exec`).
- [ ] 1.3 (Mensch: LeoCloud-Zugang, Ergebnis in design.md festhalten) Verify on LeoCloud whether `NetworkPolicy` objects and `nginx.ingress.kubernetes.io/limit-rpm` annotations are enforced; record the result in `design.md`.
- [ ] 1.4 (Mensch: Entscheidung des Product Owners) Decide with the product owner whether store managers may archive their store and change beacon identities (SEC-14) and record the decision in `admin-role-access-control` through a follow-up delta if it changes.

## 2. Keycloak

- [x] 2.1 Create `k8s/keycloak-realm-prod.json` without `users`, with `bruteForceProtected`, `passwordPolicy`, `sslRequired: external`, and client `indooro-admin-web` without direct access grants and without `localhost` URIs. (`k8s/keycloak-realm-prod.json`)
- [x] 2.2 Rewrite `k8s/keycloak.yaml` for the latest Keycloak 26.x with `start`, `KC_DB=postgres`, `KC_HOSTNAME`, `KC_PROXY_HEADERS=xforwarded`, health enabled, and secret references only; remove the inline `Secret`. (`k8s/keycloak.yaml`, Keycloak 26.0.8; Mensch: aktuellen 26.x-Patch-Tag und Health-Probes auf Port 9000 auf LeoCloud pruefen)
- [x] 2.3 Create database `keycloak` and user in PostgreSQL through an init job or documented `psql` commands. (`k8s/keycloak-db-init-job.yaml` und `psql`-Befehle in `DEPLOYMENT.md`; Ausfuehren: Mensch)
- [x] 2.4 Restrict the Keycloak ingress to `/keycloak/realms/` and `/keycloak/resources/`. (`k8s/backend-ingress.yaml`)
- [x] 2.5 Add `V17__disable_demo_access_outside_dev.sql` using the Flyway placeholder `demoAccess`; set `quarkus.flyway.placeholders.demoAccess=false`, `%dev.…=true`, `%test.…=true`. (Migration heisst `V17`, weil `V12`–`V14` nicht belegt und `V15` schon vergeben ist; Nachweis `DemoAccessMigrationTest`)
- [x] 2.6 Switch `npm run api:test` against LeoCloud to the token-based suites and document it in `api-tests/httpyac/README.md`; add the missing `.env.example`. (`api-tests/httpyac/.env.example` und README; `api:test` bleibt unveraendert, weil fuer Suiten 05/06 keine Token-Variante existiert)

## 3. Output Encoding and Headers

- [x] 3.1 Move `escapeHtml` into `admin/editor-core.js` and use it or `textContent` for every interpolated value in `admin/editor.js` (lines 279, 286–287, 789, 880 and all `data-*` ids).
- [x] 3.2 Replace `innerHTML` interpolation in `customer/app.js` with DOM construction or escaping.
- [x] 3.3 Remove the Tailwind Play CDN from `customer/index.html` and add the required classes to `customer/style.css`.
- [x] 3.4 Add `quarkus.http.header` configuration for Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy`, and `%prod` HSTS.
- [x] 3.5 Send the same CSP from `scripts/serve-admin-smoke.mjs` and add a Playwright test that stores a malicious label and asserts literal rendering and no console CSP violations.

## 4. Backend Hardening

- [x] 4.1 Add `LayoutDocumentValidator` and call it from `LayoutService.saveCurrentLayout` and `StoreLayoutAdminService.saveLayoutVersion`.
- [x] 4.2 Bound `PdfExportService` inputs (products, name length, level/position/meter ranges) and replace unencodable characters. (implemented in release-pilot-backend)
- [x] 4.3 Bound `PdfImportService` inputs (10 MB, 50 pages) and replace the `DOTALL` item regex with line-based parsing with bounded numeric groups. (implemented in release-pilot-backend)
- [x] 4.4 Change `ErrorLogService` and both exception mappers to persist only 5xx and authenticated admin 4xx, return generic 5xx messages with `correlationId`, and guard persistence with `try/catch`. (`ErrorLogService.record`, beide Mapper; `ErrorLogServiceTest`, `ErrorPolicyResourceTest`)
- [x] 4.5 Add `quarkus-scheduler` and a daily retention job for `error_logs` (30 days, 50 000 rows). (`ErrorLogRetentionJob`; die HQL-Loeschabfragen sind nicht gegen echtes PostgreSQL getestet)
- [x] 4.6 Add `V16__audit_actor_subject.sql` and resolve the acting user in `AuditLogService`, `StoreLayoutAdminService`, and `RecipeService`. (Migration heisst `V16`; `AuditLogServiceTest`)
- [x] 4.7 Audit recipe tag, admin product, and category mutations. (`CatalogMutationAuditTest`, `RecipeTagAuditTest`)
- [x] 4.8 Add `@Valid` and size limits to `UpsellPlanRequest` and `UpsellSuggestionRequest`; reduce `debug` to `requestId`, `responseSource`, `fallbackReason`, and retryability for non-admin requests. (`UpsellDtos`, `MobileUpsellResource`; `debug` hat kein Retryability-Feld, weil `UpsellPlanDebug` es noch nicht kennt (stabilize-upsell-quality-and-request-lifecycle 5.9))
- [x] 4.9 Implement `MobileRateLimitFilter` with the limits shared with `modernize-ios-client-architecture` (and optional ingress annotations per task 1.3); mark `modernize-ios-client-architecture` task 13.1 as delivered by this change. (`MobileRateLimitFilter`, `RateLimiter`; Task 13.1 in `modernize-ios-client-architecture` ist damit backendseitig geliefert)

## 5. Infrastructure

- [x] 5.1 Change `opensearch` and `dashboards` services to `ClusterIP`, set dashboards replicas to 0, and add `k8s/network-policy.yaml`. (ClusterIP and dashboards replicas 0 implemented in release-pilot-backend; the NetworkPolicy stays open until task 1.3 confirms LeoCloud enforces it) (`k8s/network-policy.yaml` liegt vor; Anwenden erst nach Task 1.3 (Mensch))
- [x] 5.2 Create secret `indooro-postgres-secret` and reference it from `k8s/postgres.yaml` and `k8s/backend.yaml`. (manifests implemented in release-pilot-backend; the secret itself is created in phase B)
- [x] 5.3 Switch the Dockerfile to a JRE base image with a non-root user; add `securityContext`, `/tmp` `emptyDir`, and the CI SHA image tag to `k8s/backend.yaml`; change the backend service to `ClusterIP`. (Dockerfile mit `eclipse-temurin:21-jre` und UID 10001, `k8s/backend.yaml`; Mensch: neues CI-Image bauen und Tag in `backend.yaml` setzen, der alte Tag `a47c5e6` laeuft nicht als Nicht-root)
- [x] 5.4 Add `quarkus-smallrye-health` and replace TCP probes with `/q/health/live` and `/q/health/ready`. (`quarkus-smallrye-health`, Probes in `k8s/backend.yaml`)
- [x] 5.5 Delete the unreferenced `k8s/volume-claim.yaml`. (implemented in release-pilot-backend)

## 6. Tests

- [x] 6.1 Add Quarkus tests for audit actor attribution, tag/product/category audit entries, error persistence policy, generic 5xx body, layout validation limits, PDF bounds, upsell nested validation, and reduced anonymous diagnostics. (Tests siehe 4.4–4.9 und `LayoutDocumentValidatorTest`, `PdfExportServiceBoundsTest`)
- [x] 6.2 Add `node --test` cases for `escapeHtml` usage in editor helpers.
- [x] 6.3 Run `npm run admin:verify` with the CSP-enabled smoke server.

## 7. Documentation and Deployment

- [x] 7.1 Update `DEPLOYMENT.md` (secrets, Keycloak production mode, port-forward administration, NetworkPolicy, image tags). (`DEPLOYMENT.md`)
- [x] 7.2 Update `docs/audit/CODE_AUDIT.md` with the resolution status of each SEC finding. (`docs/audit/CODE_AUDIT.md` Abschnitt 7)
- [ ] 7.3 (Mensch: Cluster-Rollout; vorher echten Admin in `user_access_assignments` anlegen, sonst sperrt `V17` den Zugang) Roll out to LeoCloud in the order of the migration plan and record image tags and commands.

## 8. Verification

- [ ] 8.1 (Mensch: LeoCloud) Demonstrate that `indooro-admin`/`admin` cannot log in on LeoCloud and that `/keycloak/admin/` is not publicly reachable.
- [ ] 8.2 (Mensch: LeoCloud und Debug-Pod) Demonstrate that OpenSearch is unreachable from outside the namespace.
- [ ] 8.3 (Mensch: Browser gegen LeoCloud) Demonstrate that the malicious-label layout renders literally in editor and customer page.
- [ ] 8.4 (Mensch: Rollout auf LeoCloud) Demonstrate that the oversized PDF export returns 400 within one second.
- [ ] 8.5 (Teilweise: `./mvnw test` 459 Tests gruen und `validate --all --strict` gruen; Mensch: `npm run api:test:roles:tokens` braucht Tokens, `npm run admin:verify` laeuft im Folge-Check) Run `./mvnw test`, `npm run admin:verify`, `npm run api:test:roles:tokens`, and `npx -y @fission-ai/openspec@1.3.1 validate harden-platform-security-baseline --strict`.
