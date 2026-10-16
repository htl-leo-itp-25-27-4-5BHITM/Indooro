## ADDED Requirements

### Requirement: Database backup and restore are scripted and rehearsed
The operations tooling SHALL provide scripts that create a PostgreSQL custom-format dump of the LeoCloud database and an NDJSON export of all products, store them outside the repository, and restore a dump into a local PostgreSQL. A restore SHALL be rehearsed at least once before the first in-store pilot session, and a fresh backup SHALL be taken on the day of each pilot session. Backups SHALL NOT be committed to git.

#### Scenario: Rehearsed restore
- **GIVEN** a dump taken from LeoCloud
- **WHEN** it is restored into a local PostgreSQL and the backend runs against it
- **THEN** the pilot store, its active layout and its beacons are present

### Requirement: Search cluster is not exposed outside the namespace
OpenSearch and OpenSearch Dashboards services SHALL use service type `ClusterIP` in the LeoCloud manifests, and no manifest, compose file or deployment document SHALL contain a literal password or client secret; they SHALL reference Kubernetes secrets or environment files that are not committed.

#### Scenario: Manifest review
- **WHEN** `k8s/`, `docker-compose.yml` and `DEPLOYMENT.md` are searched for password and secret values
- **THEN** only secret references and placeholder names are found, and `k8s/opensearch.yaml` contains no `NodePort`
