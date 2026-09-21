## ADDED Requirements

### Requirement: Search cluster is reachable only inside the namespace
OpenSearch and OpenSearch Dashboards SHALL be exposed only through `ClusterIP` services, a namespace `NetworkPolicy` SHALL allow OpenSearch ingress only from the backend pods, and Dashboards SHALL be scaled to zero unless an operator starts it temporarily.

#### Scenario: OpenSearch is probed from outside the namespace
- **GIVEN** the production deployment
- **WHEN** a client outside the namespace connects to any node port or service address of OpenSearch
- **THEN** the connection is refused or times out

#### Scenario: The backend queries OpenSearch
- **GIVEN** the NetworkPolicy is applied
- **WHEN** the backend searches products
- **THEN** the search succeeds

### Requirement: Backend workload is hardened
The backend deployment SHALL run a JRE-based image as a non-root user with a read-only root filesystem and a writable `/tmp` volume, SHALL reference an immutable image tag produced by CI, SHALL use HTTP liveness and readiness probes on `/q/health/live` and `/q/health/ready`, and SHALL read database credentials from the secret `indooro-postgres-secret`. The backend service SHALL be of type `ClusterIP`.

#### Scenario: The manifest is inspected
- **GIVEN** `k8s/backend.yaml`
- **WHEN** a reviewer checks the pod spec
- **THEN** it contains `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, an image tag other than `latest`, both HTTP probes, and no plain-text database password

#### Scenario: The database is unreachable
- **GIVEN** PostgreSQL is down
- **WHEN** Kubernetes evaluates the readiness probe
- **THEN** the backend pod is marked not ready and receives no traffic
