# deployment-operations Specification

## Purpose
Defines local development and LeoCloud deployment operations for Indooro, including runtime components, namespace/host, Kubernetes manifests, backend image rollout, externalized secrets, and verification expectations.
## Requirements
### Requirement: Local development stack is reproducible
The project SHALL provide a reproducible local development path for Quarkus, PostgreSQL, OpenSearch, OpenSearch Dashboards, and Keycloak.

#### Scenario: Developer starts local services
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** a developer follows the documented local setup
- **THEN** the required backing services are available with the configured hostnames, ports, indexes, realm, and credentials needed by the backend

#### Scenario: Developer runs Quarkus locally
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** the backend runs locally without deployment overrides
- **THEN** it uses local defaults for datasource, OpenSearch, and OIDC where documented

### Requirement: LeoCloud deployment target is explicit
The project SHALL document LeoCloud as the current deployment target with namespace `student-it220209` and public host `it220209.cloud.htl-leonding.ac.at`.

#### Scenario: Operator deploys to LeoCloud
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** an operator applies Kubernetes manifests for Indooro
- **THEN** they use the documented namespace and host unless a future deployment change updates them

#### Scenario: Public URL is tested
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** a deployed route is verified
- **THEN** the verification uses the public host `https://it220209.cloud.htl-leonding.ac.at` where applicable

### Requirement: Kubernetes manifests define runtime components
The deployment SHALL define Kubernetes resources for PostgreSQL, OpenSearch, OpenSearch Dashboards, Keycloak, and the Indooro backend where those services are part of the LeoCloud runtime.

#### Scenario: Cluster resources are inspected
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** an operator checks the Indooro namespace
- **THEN** the expected deployments, services, routes/ingress resources, config maps, and secrets can be traced back to files under `k8s/`

#### Scenario: Component fails readiness
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** a runtime component fails readiness or startup checks
- **THEN** the operator can inspect the corresponding Kubernetes deployment, pod logs, and service configuration

### Requirement: Backend image rollout is traceable
The project SHALL deploy backend changes through a traceable container image and Kubernetes rollout process.

#### Scenario: Backend image is updated
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** a backend runtime change is built and pushed
- **THEN** the image tag or digest and the rollout command are documented or visible in the deployment workflow

#### Scenario: Rollout is restarted
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** the backend deployment is restarted after a new image push
- **THEN** the operator can verify the new pod is running and serving expected endpoints

### Requirement: Secrets and environment overrides are externalized
The deployment SHALL externalize database, OpenSearch, Keycloak, OIDC client, and other sensitive runtime settings through Kubernetes secrets, config maps, or environment variables rather than hardcoding production secrets in source code.

#### Scenario: Backend starts in LeoCloud
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** the backend pod starts in LeoCloud
- **THEN** it receives datasource, OpenSearch, and OIDC settings from deployment configuration

#### Scenario: Secret changes
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** a secret such as the OIDC client secret changes
- **THEN** the backend can be redeployed or restarted with the new secret without changing Java source code

### Requirement: Deployment verification covers public and protected behavior
Every deployment-affecting change SHALL verify representative public routes, protected admin routes, authentication behavior, and key backing-service connectivity.

#### Scenario: Public mobile route is tested
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** deployment verification runs
- **THEN** at least one public mobile route is checked without Admin Platform login

#### Scenario: Protected admin route is tested
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** deployment verification runs
- **THEN** at least one protected admin route or page is checked for login/authorization behavior

### Requirement: Operational commands are concrete
Deployment documentation SHALL provide concrete commands or command patterns for applying manifests, restarting deployments, checking rollout status, reading logs, and testing URLs.

#### Scenario: Operator follows docs
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** an operator follows the deployment documentation
- **THEN** they can run the commands without needing to infer namespace, deployment names, or public host from unrelated files

#### Scenario: Verification fails
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** a verification command fails
- **THEN** the documented operational workflow gives the operator enough context to inspect pods, logs, and service configuration

### Requirement: Runtime documentation separates local and cloud behavior
The project SHALL clearly distinguish local development URLs and credentials from LeoCloud URLs, Kubernetes secrets, and production-like deployment settings.

#### Scenario: Local Keycloak URL is used
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** a developer runs the backend locally
- **THEN** local OIDC configuration points to the local Keycloak realm, not the LeoCloud public realm

#### Scenario: LeoCloud Keycloak URL is used
- **GIVEN** the documented local or LeoCloud deployment context is being operated
- **WHEN** the backend runs in LeoCloud
- **THEN** OIDC configuration points to the LeoCloud Keycloak realm under the public host and `/keycloak` path

### Requirement: Hosted web surfaces are explicit
The LeoCloud deployment SHALL serve the landing page, Admin Platform, layout editor, server-log page, and customer web page through the backend public host.

#### Scenario: Public host is used
- **GIVEN** the LeoCloud ingress routes to the backend
- **WHEN** a user opens the documented hosted paths
- **THEN** `/`, `/admin/`, `/admin/editor/`, `/admin/server-logs/`, and `/customer/` resolve according to their auth boundaries

#### Scenario: Admin page is requested
- **GIVEN** Keycloak auth is active
- **WHEN** an anonymous user opens an admin hosted path
- **THEN** the request follows the Admin Platform login boundary

### Requirement: Mobile app API base URL is environment-specific
The iOS app SHALL use the LeoCloud API base URL for deployed/demo backend access and local `localhost` API base URLs only for local development.

#### Scenario: App targets LeoCloud
- **GIVEN** the app is configured for the deployed backend
- **WHEN** it calls Indooro APIs
- **THEN** its base URL points to `https://it220209.cloud.htl-leonding.ac.at/api`

#### Scenario: App targets local development
- **GIVEN** a developer runs the backend locally
- **WHEN** the app is configured for local testing
- **THEN** it uses the local backend URL intentionally rather than accidentally shipping it as the demo target

### Requirement: Java 24 build flag is documented
The project SHALL document the Byte Buddy experimental flag required for this Quarkus version when local Java 24 builds/tests need it.

#### Scenario: Developer builds with Java 24
- **GIVEN** a developer uses Java 24 with the current Quarkus stack
- **WHEN** they run Maven package or tests
- **THEN** the build path includes `-Dnet.bytebuddy.experimental=true` through `.mvn/jvm.config` or explicit command flags

#### Scenario: CI/runtime Java changes
- **GIVEN** a future change updates Java or Quarkus versions
- **WHEN** the flag is no longer needed or changes behavior
- **THEN** the change updates deployment/build documentation and OpenSpec context

### Requirement: Product data import is part of deployment verification
Deployment verification SHALL distinguish backend health from catalog readiness by checking whether product data has been imported when product search is part of the demo.

#### Scenario: Backend is healthy but catalog is empty
- **GIVEN** the backend health check succeeds
- **WHEN** no product bulk import has populated OpenSearch
- **THEN** the deployment is not considered catalog-demo-ready

#### Scenario: Demo catalog is imported
- **GIVEN** a demo product JSON file is available
- **WHEN** the operator posts it to `/api/products/bulk`
- **THEN** product list/search verification can confirm usable catalog data

### Requirement: Deployment leftovers are tracked as open points
The project SHALL keep known deployment inconsistencies visible until fixed, including old image names, obsolete volume manifests, and `latest` image rollout behavior.

#### Scenario: Backend image is rebuilt with `latest`
- **GIVEN** the backend image is pushed using the `latest` tag
- **WHEN** the cluster does not pull a new pod automatically
- **THEN** the operator uses a documented rollout restart or future digest/tag strategy

#### Scenario: Old manifest is reviewed
- **GIVEN** a manifest such as an obsolete volume claim appears unused
- **WHEN** a cleanup change is proposed
- **THEN** it verifies current cluster/resource usage before removal

### Requirement: Backend coverage reports can be generated during verification
The project SHALL allow backend Java coverage reports to be generated as part of local or CI verification without changing deployed runtime behavior.

#### Scenario: Local verification includes coverage
- **WHEN** a developer runs the documented backend coverage command locally
- **THEN** the command verifies backend Java tests and produces coverage artifacts without requiring a LeoCloud deployment

#### Scenario: CI verification includes coverage artifacts
- **WHEN** a future CI workflow runs backend Java tests with coverage enabled
- **THEN** CI can publish or retain the generated JaCoCo HTML or XML artifacts without changing Kubernetes manifests, runtime images, public routes, Keycloak configuration, or database schema

#### Scenario: Coverage generation is not a deployment gate initially
- **WHEN** the first backend coverage reporting change is implemented
- **THEN** CI or local verification does not fail solely because coverage percentages are below a threshold

### Requirement: Admin frontend deployment remains traceable
The redesigned Admin Platform and layout editor SHALL be built and deployed through a traceable process that serves the resulting assets from the existing backend public host and keeps `/admin/`, `/admin/editor/`, and `/admin/server-logs/` under the configured authentication boundary.

#### Scenario: Redesigned admin assets are deployed
- **WHEN** the backend image or static asset bundle containing the redesigned Admin Platform is deployed
- **THEN** `/admin/`, `/admin/regions/`, `/admin/stores/`, `/admin/stores/detail/`, `/admin/beacons/`, `/admin/products/`, `/admin/recipes/`, `/admin/editor/`, and `/admin/server-logs/` resolve through the backend host according to the existing protected route policy

#### Scenario: Frontend build dependency is introduced
- **WHEN** the implementation introduces a frontend build tool or package dependency
- **THEN** the repository documents local build commands, CI/build integration, asset output location, and rollback behavior for the Quarkus-served Admin Platform

### Requirement: Admin redesign verification covers UX-critical routes
Deployment verification SHALL include representative checks for redesigned admin shell rendering, protected-route behavior, role-aware navigation, core list pages, store detail, layout editor canvas, save/publish affordances, and public mobile/customer route preservation.

#### Scenario: Protected admin route is verified
- **WHEN** deployment verification runs after the redesign
- **THEN** at least one protected Admin Platform route confirms login/authorization behavior and at least one authenticated smoke path verifies page rendering

#### Scenario: Public route is verified
- **WHEN** deployment verification runs after the redesign
- **THEN** representative public mobile/customer routes remain accessible without Admin Platform login

