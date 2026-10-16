## Why

The pilot app reads stores, layouts and products from the LeoCloud backend. The pilot audit (`docs/pilot-readiness/01_PROJECT_AUDIT.md` 3.3) found that this backend is not safe to operate for a real store:

- OpenSearch runs with the security plugin disabled and is exposed as `NodePort` (`k8s/opensearch.yaml:26,51,76`); anyone reaching a node can change products and layouts.
- Passwords and a client secret are committed in plain text (`k8s/*.yaml`, `keycloak/realm/indooro-realm.json`, `DEPLOYMENT.md`, `docker-compose.yml`, defaults in `application.properties`).
- There is no PostgreSQL backup; store layouts and beacon assignments exist in one database instance only.
- CI builds with `-DskipTests` and pushes a floating `:latest` tag (`.github/workflows/ci.yaml:34,48`); there is no traceable rollout or rollback.
- The rebuilt admin platform (`codex/admin-platform-rebuild`, React admin under `/admin/next/`) is not deployed; LeoCloud runs the legacy admin from `main`.
- Anonymous write/utility routes (`POST /api/convert/pdf-to-json`, `POST /api/export/pdf`, legacy layout writes) are specified to be closed in the open change `protect-legacy-write-endpoints`.

## What Changes

Phase A (now, branch from `main`, no backend Java and no Keycloak realm edits, because `codex/admin-platform-rebuild` still changes them):

- OpenSearch and Dashboards services to `ClusterIP`, Dashboards replicas 0; manifests reference secrets only; `.env.example` for compose; `DEPLOYMENT.md` without real values (implements `harden-platform-security-baseline` 5.1, 5.2, 5.5).
- Cross-platform Python scripts for PostgreSQL backup, product export, local restore, and a mobile smoke check.
- CI runs backend tests and tags images with the commit SHA in addition to `latest`.
- Release runbook with rollout, verification and rollback commands, and a release log.

Phase B (after `codex/admin-platform-rebuild` is merged into `main`):

- Implement `protect-legacy-write-endpoints` completely and the pilot-relevant part of `harden-platform-security-baseline` (1.1, 1.2, 4.2, 4.3, 8.2) plus `fix-ios-contract-and-spec-drift` 2.1–2.4.
- Prepare the first pilot release of `main` (admin rebuild + hardening) to LeoCloud: rotation of secrets, rollout, smoke check, release log. Commands are executed by the person with cluster access.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `deployment-operations`: backup and restore, search cluster exposure and secret handling, immutable pilot releases with rollback, mobile smoke check.

## Impact

- Owner: Person B „Backend & Betrieb“ (Windows). Branch `pilot/release-backend` from `main` (contains the pilot planning documents); pull requests go to `main`.
- Files phase A: `k8s/**`, `docker-compose.yml`, `.env.example`, `DEPLOYMENT.md`, `.github/workflows/ci.yaml`, `scripts/ops/**` (new), `docs/pilot-readiness/operations/{BACKUP_RESTORE,SECRET_ROTATION,RELEASE_RUNBOOK,RELEASES}.md` (new), `.gitignore` (`backups/`).
- Files phase B: backend sources and resources per `protect-legacy-write-endpoints`, `keycloak/**` per `harden-platform-security-baseline`.
- LeoCloud access (namespace `student-it220209`) is needed only to execute documented commands; the owner prepares them.
- Works on Windows: Java 17+, Maven wrapper (`mvnw.cmd`), Docker Desktop, Python 3, Node.js, kubectl.
