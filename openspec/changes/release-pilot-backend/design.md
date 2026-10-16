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
