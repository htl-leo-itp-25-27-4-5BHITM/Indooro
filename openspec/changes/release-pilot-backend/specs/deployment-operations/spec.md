## ADDED Requirements

### Requirement: Database backup and restore are scripted and rehearsed
The operations tooling SHALL provide cross-platform scripts that create a PostgreSQL custom-format dump of the LeoCloud database and an NDJSON export of all products, store them outside the repository, and restore a dump into a local PostgreSQL. A restore SHALL be rehearsed at least once before the first in-store pilot session, and a fresh backup SHALL be taken on the day of each pilot session and before every rollout. Backups SHALL NOT be committed to git.

#### Scenario: Rehearsed restore
- **GIVEN** a dump taken from LeoCloud
- **WHEN** it is restored into a local PostgreSQL and the backend runs against it
- **THEN** the pilot store, its active layout and its beacons are present

### Requirement: Search cluster is not exposed outside the namespace
OpenSearch and OpenSearch Dashboards services SHALL use service type `ClusterIP` in the LeoCloud manifests, and no manifest, compose file or deployment document SHALL contain a literal password or client secret; they SHALL reference Kubernetes secrets or environment files that are not committed.

#### Scenario: Manifest review
- **WHEN** `k8s/`, `docker-compose.yml` and `DEPLOYMENT.md` are searched for password and secret values
- **THEN** only secret references and placeholder names are found, and `k8s/opensearch.yaml` contains no `NodePort`

### Requirement: Pilot releases use immutable images and a rollback path
Every backend rollout for the pilot SHALL deploy an image tagged with the Git commit SHA built by CI after the backend tests passed, SHALL be preceded by a backup, SHALL be recorded in `docs/pilot-readiness/operations/RELEASES.md` with date, commit, image tag, manifests applied and smoke-check result, and SHALL have a documented rollback to the previous image tag.

#### Scenario: Rollout with failing smoke check
- **GIVEN** a new image tag was rolled out
- **WHEN** the smoke check fails
- **THEN** the previous image tag is restored with the documented rollback command and both events are recorded

### Requirement: Mobile pilot endpoints have a smoke check
The operations tooling SHALL provide a cross-platform smoke check that, for a given base URL and store id, verifies HTTP 200 and non-empty content for `GET /api/mobile/stores`, `GET /api/mobile/stores/{storeId}/layout/current` and `GET /api/products/search?q=<sample>`, reports the number of shelves, beacons and products, and exits non-zero on any failure.

#### Scenario: Smoke check before a session
- **WHEN** the smoke check runs against LeoCloud for the pilot store
- **THEN** it prints status, shelf count, beacon count and product count and exits with code 0
