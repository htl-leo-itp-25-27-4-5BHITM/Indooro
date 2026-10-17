## 1. Setup

- [x] 1.1 Check out branch `pilot/release-backend` (tracks `origin/pilot/release-backend`, based on `main` plus the pilot planning documents). Install Java 17+, Docker Desktop, Python 3.10+, Node.js, kubectl.
- [x] 1.2 Run `backend\indooro_server\mvnw.cmd test` (Windows) or `./mvnw test`; record the result in `design.md` under „Baseline“. If tests need services that are not available, record which.
- [x] 1.3 Read `DEPLOYMENT.md`, `docs/RUNBOOK.md`, `k8s/*.yaml`, `.github/workflows/ci.yaml`, `harden-platform-security-baseline/{design,tasks}.md`, `protect-legacy-write-endpoints/{design,tasks}.md`.
- [x] 1.4 Run `npx -y @fission-ai/openspec@1.3.1 validate release-pilot-backend --strict`.

## 2. Manifests and Secrets (phase A)

- [x] 2.1 Change `opensearch` and `dashboards` services in `k8s/opensearch.yaml` to `ClusterIP`; set dashboards replicas to 0.
- [x] 2.2 Replace literal passwords in `k8s/postgres.yaml`, `k8s/backend.yaml`, `k8s/keycloak.yaml` with `secretKeyRef`; add `k8s/secrets.example.yaml` (names, placeholder values).
- [x] 2.3 Replace literal passwords in `docker-compose.yml` with `${VAR}`; add `.env.example`; make sure `.env` is gitignored; remove real values from `DEPLOYMENT.md` and point to `SECRET_ROTATION.md`.
- [x] 2.4 Delete the unreferenced `k8s/volume-claim.yaml` after confirming no manifest references it.
- [x] 2.5 Verify with a search that `k8s/`, `docker-compose.yml`, `DEPLOYMENT.md` contain no literal secret values; mark `harden-platform-security-baseline` 5.1, 5.2, 5.5 with „(implemented in release-pilot-backend)“.

## 3. Backup, Restore, Smoke (phase A)

- [x] 3.1 Implement `scripts/ops/backup_postgres.py` (kubectl exec into the postgres pod, `pg_dump -Fc`, stream to `backups/`), `export_products.py` (paged `GET /api/products` to NDJSON), `restore_postgres.py` (restore a dump into a local docker Postgres). Add `backups/` to `.gitignore`.
- [x] 3.2 Implement `scripts/ops/pilot_smoke.py <base-url> <storeId> <query>` per requirement „Mobile pilot endpoints have a smoke check“.
- [x] 3.3 Add unit tests for argument parsing and response evaluation with recorded sample responses (no network) under `scripts/ops/tests/`; run `python -I -m unittest discover scripts/ops`.
- [x] 3.4 Rehearse a local restore end to end (local dump from a dev database, restore, backend in dev mode against it); document commands and result in `docs/pilot-readiness/operations/BACKUP_RESTORE.md`.
- [ ] 3.5 Human step (person with LeoCloud access): take the first real LeoCloud backup with the script and confirm the restore works locally; record date in `STATUS.md`.

## 4. CI and Release Flow (phase A)

- [x] 4.1 Change `.github/workflows/ci.yaml` to run the backend tests (`mvn -B verify`) and to tag images with the commit SHA and `latest`.
- [x] 4.2 Write `docs/pilot-readiness/operations/RELEASE_RUNBOOK.md` per design decision 5 with exact `kubectl -n student-it220209 …` commands (no secret values) and `RELEASES.md` (empty log table).
- [x] 4.3 Write `docs/pilot-readiness/operations/SECRET_ROTATION.md`: order (backup first), commands without values, verification, what to do if login fails.
- [ ] 4.4 Open a pull request `pilot/release-backend` → `main` for phase A; update `STATUS.md` (row „Person B“).

## 5. Backend Hardening (phase B, only after codex/admin-platform-rebuild is merged into main)

- [x] 5.1 Confirm the admin rebuild merge on `origin/main` (record the commit); merge `origin/main` into `pilot/release-backend`.
- [ ] 5.2 Check which parts of `protect-legacy-write-endpoints` the admin rebuild already implemented (e.g. legacy layout POST admin-only, commit `6daed83`); mark them; implement the rest of sections 1–6 of that change. (Sections 2, 3.1, 3.4 and 4 done in phase A; 3.2/3.3 deliberately skipped, 5.3/6.x remain, see design.md notes.)
- [x] 5.3 Implement `harden-platform-security-baseline` 4.2 and 4.3 (PDF export/import bounds) and mark them.
- [ ] 5.4 Implement `fix-ios-contract-and-spec-drift` 2.1–2.4 (upsell dismissal bound) and mark them.
- [ ] 5.5 Run `mvnw test`, `npm run admin:verify` (if present), the httpyac role matrix against a local stack if available, and `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 5.6 Open a pull request `pilot/release-backend` → `main` for phase B.

## 6. First Pilot Release (phase B, human execution)

- [ ] 6.1 Human step (person with cluster access): backup, rotate Keycloak admin/demo passwords and client and database secrets per `SECRET_ROTATION.md` (`harden-platform-security-baseline` 1.1, 1.2).
- [ ] 6.2 Human step: roll out `main` at the merged SHA per `RELEASE_RUNBOOK.md`; run the smoke check; log in `RELEASES.md`.
- [ ] 6.3 Verify from outside the cluster that OpenSearch is not reachable and the new admin `/admin/next/` works with a store-manager account; mark `harden-platform-security-baseline` 8.2.
- [ ] 6.4 Update `STATUS.md`; notify Erik to merge `main` into `pilot/first-store`.
