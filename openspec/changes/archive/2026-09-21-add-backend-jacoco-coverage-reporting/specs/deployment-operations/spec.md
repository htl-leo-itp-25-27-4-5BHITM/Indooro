## ADDED Requirements

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
