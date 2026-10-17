## Context

- Namespace `student-it220209`, host `it220209.cloud.htl-leonding.ac.at`; components PostgreSQL 16 (1 replica, 2 Gi PVC), OpenSearch 2.9 (security disabled), Dashboards, Keycloak 24.0.5 (compose uses 26.2), backend 1 replica (`DEPLOYMENT.md`, `k8s/`).
- CI: `.github/workflows/ci.yaml` builds with `mvn -B package -DskipTests` and pushes `ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:latest`.
- Backend tests: 142 tests in 23 classes on the admin branch, last local run green; no Testcontainers dependency found.
- `codex/admin-platform-rebuild` changes `application.properties`, `keycloak/realm/indooro-realm.json` and 66 backend source files, but not `k8s/`, `docker-compose.yml`, `.github/`.
- `harden-platform-security-baseline` and `protect-legacy-write-endpoints` already specify the backend hardening in detail; this change does not duplicate their requirements and marks their tasks when done.

## Goals / Non-Goals

Goals: closed search cluster, no secrets in git, restorable data, traceable releases, the rebuilt admin live for pilot data entry.

Non-goals: Keycloak production redesign beyond the selected tasks, NetworkPolicy if LeoCloud does not enforce it, monitoring stack, multi-replica setups, autoscaling.

## Decisions

1. **Cross-platform scripts in Python.** `scripts/ops/backup_postgres.py`, `export_products.py`, `restore_postgres.py`, `pilot_smoke.py` use only the standard library plus the `kubectl`, `docker` executables via `subprocess`; they run identically in PowerShell, WSL and macOS. No bash-only scripts.
2. **Backup location.** `backups/<UTC date>-indooro.dump` and `backups/<date>-products.ndjson`, gitignored; the person who takes the backup keeps a copy outside the laptop (school drive).
3. **Secrets.** Manifests reference `secretKeyRef`; `k8s/secrets.example.yaml` lists names with placeholders; creation via `kubectl create secret generic … --from-literal=…` documented without values. Git history still contains old values, so rotation in phase B is mandatory.
4. **CI.** Run `mvn -B verify` (tests included) before building the image; tag with `${{ github.sha }}` and `latest`; keep build under 10 minutes or document why not.
5. **Release flow.** backup → apply manifests → set image to SHA tag → rollout status → smoke check → log in `RELEASES.md`; rollback = set previous SHA tag → smoke check → log.
6. **Phase gate.** Phase B starts when `git log origin/main` contains the merge of `codex/admin-platform-rebuild`. Before that, no edits under `backend/**`, `admin-ui/**`, `keycloak/**`.

## Risks / Trade-offs

- Rotating secrets in the wrong order can lock out the admin; follow `harden-platform-security-baseline` design order and back up first.
- Running tests in CI may expose environment-dependent failures; fix or document them, do not re-add `-DskipTests`.
- School cloud availability is outside the team's control; the iOS layout cache (`add-pilot-guided-tour-fallbacks`) mitigates outages during a session.

## Migration / Rollback

Manifest changes are reversible by applying the previous version; image rollback by previous SHA tag; data rollback by restoring the latest dump.

## Baseline

2026-10-17, `main` at `a47c5e6` (merged into `pilot/release-backend`): `cd backend/indooro_server && sh ./mvnw -B test` → 186 tests, 0 failures, 0 errors, no external services needed (all services are mocked). `admin-ui`: `npm run typecheck` and `npm test` (93 tests) green.

## Implementation notes

- **Phase gate is open.** The admin rebuild is in `main` (release `a47c5e6`), so phase A also contains the backend work that phase B listed for the pilot: `protect-legacy-write-endpoints` sections 2, 3.1, 3.4, 4 and `harden-platform-security-baseline` 4.2, 4.3 (all marked there as „implemented in release-pilot-backend“). Not done here: `fix-ios-contract-and-spec-drift` 2.1–2.4 (upsell dismissal bound), `protect-legacy-write-endpoints` 3.2 CORS (a GitHub Pages site under `www.indooro.at` may read the API cross-origin) and 3.3 body limit (admin underlay needs 14 MB), 5.3 and 6.3 (live checks).
- **Secrets in the Keycloak realm.** Keycloak substitutes `${NAME}` from environment variables while importing a realm (verified with Keycloak 26.2 in Docker). `k8s/keycloak.yaml` and `keycloak/realm/indooro-realm.json` therefore contain only placeholders (`KC_ADMIN_WEB_CLIENT_SECRET`, `KC_DEMO_*_PASSWORD`). The k8s values come from `indooro-keycloak-secret`, the local values from `.env`. A missing secret key keeps the pod in `CreateContainerConfigError` instead of starting with a literal `${…}` password.
- **Keycloak state on LeoCloud.** `start-dev` with `KC_DB=dev-file` and no volume re-imports the realm on every pod start. Passwords changed only in the console are lost on restart; the secret is the source of truth. `SECRET_ROTATION.md` documents this.
- **Image tag.** `k8s/backend.yaml` pins `:a47c5e6` with `imagePullPolicy: IfNotPresent`. CI tags the short commit SHA (same format as the live tag) and `latest`. Service type of `indooro-backend` stays `NodePort` (unchanged, reachable through the ingress as before).
- **Postgres.** Strategy `Recreate`, because a RWO data directory must never be mounted by two Postgres pods. Moving `POSTGRES_PASSWORD` to a secret changes the pod template, so applying `k8s/postgres.yaml` restarts Postgres once; the secret must contain the current password first (`SECRET_ROTATION.md` step 1).
- **Verified against a real stack (local, prod profile jar + Keycloak 26.2 + PostgreSQL 16, OpenSearch not running).** Anonymous write routes answer 302 (hybrid OIDC redirect; the unit tests with `@TestSecurity` see 401), store-manager and region-manager get 403, admin passes; `GET /api/mobile/stores` stays 200 anonymously and `POST /api/mobile/upsell/suggestions` is not blocked. OpenSearch-backed reads answer 500 there because OpenSearch was not started; they are not blocked by security. A missing `OIDC_CLIENT_SECRET` does **not** stop the application from starting when the OIDC server is unreachable; the Kubernetes deployment supplies `QUARKUS_OIDC_CREDENTIALS_SECRET` from a required secret key instead.
- **PDF export strictness.** Layout codes must now have exactly four numeric parts within bounds; the 153 demo products all comply.
- **Dev tooling.** The `admin-ui/scripts/live-*.mjs` scripts and `scripts/dev/seed_readiness_demo.py` read the demo credentials from the realm file. They now resolve the `${…}` placeholders from the environment (export the values of `.env`).
