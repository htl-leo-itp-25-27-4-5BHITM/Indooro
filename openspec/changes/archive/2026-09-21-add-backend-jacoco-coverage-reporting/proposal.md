## Why

Indooro has gained meaningful Java backend test coverage across mobile resources, admin recipe resources, upsell behavior, and service logic, but the project currently has no durable way to see which backend Java code is executed by those tests. Adding JaCoCo reporting creates a reproducible coverage baseline before introducing any coverage gates or quality promises.

## What Changes

- Add backend Java coverage reporting for `backend/indooro_server` test runs.
- Generate human-readable HTML coverage reports for local review.
- Generate machine-readable XML coverage reports for future CI/SonarQube-style integrations.
- Document how developers run backend tests with coverage and where reports are produced.
- Define a first-pass coverage interpretation policy for Indooro packages, including DTO/entity/generated/config exclusions where appropriate.
- Keep the first implementation report-only: no failing coverage thresholds unless a later OpenSpec change explicitly adds them.
- Preserve existing product behavior, REST API contracts, database schema, migrations, admin UI behavior, mobile behavior, and deployment runtime behavior.

## Capabilities

### New Capabilities
- `backend-test-coverage-reporting`: Defines reproducible Java backend coverage report generation, report artifacts, scope boundaries, package treatment, and non-blocking baseline expectations.

### Modified Capabilities
- `deployment-operations`: Clarifies that backend build/test verification can generate and publish Java coverage report artifacts without changing runtime deployment behavior.

## Impact

- Affected backend module: `backend/indooro_server`.
- Affected build system: Maven/Quarkus test lifecycle for Java 17 backend tests.
- Expected future dependency: JaCoCo Maven or Quarkus-compatible JaCoCo test integration.
- Expected reports: HTML for local inspection and XML for CI/SonarQube-style consumers.
- Affected documentation: backend README or equivalent developer verification documentation.
- CI impact: optional report generation/artifact upload can be added later, initially without blocking thresholds.
- Out of scope: Swift coverage, Admin JavaScript coverage, Playwright coverage, httpYac/manual request coverage, Flyway SQL coverage, dead-code analysis, mutation testing, and SonarQube rule configuration.
