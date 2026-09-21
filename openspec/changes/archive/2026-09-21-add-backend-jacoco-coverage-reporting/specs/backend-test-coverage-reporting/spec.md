## ADDED Requirements

### Requirement: Backend Java tests generate coverage reports
The backend SHALL provide a reproducible Maven-based way to run Java tests and generate JaCoCo coverage reports for `backend/indooro_server`.

#### Scenario: Developer generates local coverage reports
- **WHEN** a developer runs the documented backend coverage command from `backend/indooro_server`
- **THEN** Maven executes the backend Java test suite and generates a human-readable coverage report

#### Scenario: Report generation is reproducible
- **WHEN** the documented coverage command is run on a clean checkout with required test dependencies available
- **THEN** the generated report paths match the documented backend coverage report paths

### Requirement: Coverage report formats are available
The backend coverage workflow SHALL produce an HTML report for local review and an XML report suitable for future CI or analysis tooling.

#### Scenario: HTML report is generated
- **WHEN** the backend coverage command completes successfully
- **THEN** a developer can open the generated HTML report to inspect package, class, line, branch, method, and complexity coverage

#### Scenario: XML report is generated
- **WHEN** the backend coverage command completes successfully
- **THEN** a machine-readable JaCoCo XML report is available for future CI, SonarQube, or coverage-summary consumers

### Requirement: Initial coverage integration is non-blocking
The first JaCoCo integration SHALL generate reports without failing the build based on coverage percentage thresholds.

#### Scenario: Coverage is below a future desired target
- **WHEN** backend tests pass but the generated coverage percentage is lower than a desired future threshold
- **THEN** the initial coverage workflow still succeeds because threshold enforcement is not part of this change

#### Scenario: Backend tests fail
- **WHEN** backend Java tests fail during the coverage workflow
- **THEN** the Maven test run fails for the test failure rather than hiding it behind coverage reporting

### Requirement: Coverage scope is limited to backend Java code
The coverage capability SHALL describe JaCoCo results as backend Java coverage only and MUST NOT claim coverage for non-Java or non-Maven-tested project surfaces.

#### Scenario: Coverage report is interpreted
- **WHEN** a developer reviews JaCoCo coverage results
- **THEN** the results are interpreted as coverage for Java code executed by backend Maven tests

#### Scenario: Non-Java surfaces are discussed
- **WHEN** Admin JavaScript, Playwright tests, Swift code, Flyway SQL, static resources, or manual HTTP requests are discussed
- **THEN** they are treated as outside the JaCoCo backend Java coverage scope

### Requirement: Critical Indooro backend packages are visible in coverage review
The coverage workflow SHALL make coverage visible for Indooro backend packages that contain resource, service, authorization, search, recipe, upsell, and repository behavior.

#### Scenario: Resource and service packages are inspected
- **WHEN** a developer reviews the coverage report
- **THEN** coverage is visible for relevant Java packages such as `at.htl.resource`, `at.htl.resource.mobile`, `at.htl.resource.admin`, `at.htl.admin.service`, and `at.htl.service`

#### Scenario: Critical business behavior is inspected
- **WHEN** a developer evaluates backend coverage quality
- **THEN** recipe resources/services, upsell resources/services, product/OpenSearch services, and admin access boundary code are treated as high-value coverage areas

### Requirement: Low-signal Java artifacts are handled intentionally
The coverage configuration or documentation SHALL identify low-signal Java artifacts that are excluded from coverage or interpreted separately before any future threshold is enforced.

#### Scenario: DTO and entity classes affect aggregate coverage
- **WHEN** DTO records, simple JPA entities, simple Panache repositories, generated classes, or simple config/bootstrap classes affect aggregate coverage numbers
- **THEN** the project either excludes them from report metrics or documents that they are interpreted separately from business-logic coverage

#### Scenario: A repository contains meaningful logic
- **WHEN** a repository contains custom query, transformation, validation, or non-trivial behavior
- **THEN** it remains eligible for coverage review rather than being excluded solely because it is a repository

### Requirement: Coverage documentation explains limitations
The backend coverage documentation SHALL explain what JaCoCo measures and what it does not prove.

#### Scenario: Developer reads coverage documentation
- **WHEN** a developer reads the backend coverage documentation
- **THEN** the documentation states that JaCoCo measures executed Java bytecode and does not prove functional correctness, test quality, production usage, dead-code status, mutation resistance, or OpenSpec requirement coverage

#### Scenario: Coverage is compared with other quality tools
- **WHEN** a developer compares JaCoCo with dead-code analysis, mutation testing, or SonarQube
- **THEN** the documentation presents JaCoCo as complementary coverage telemetry rather than a replacement for those tools

### Requirement: Future threshold enforcement is deferred
Coverage thresholds SHALL be treated as a later explicit decision after the first backend coverage baseline is reviewed.

#### Scenario: Thresholds are proposed later
- **WHEN** a future change proposes coverage checks that fail the build
- **THEN** that change defines the exact metrics, packages/classes, excludes, minimum values, and CI behavior before enabling enforcement

#### Scenario: Conservative threshold baseline is discussed
- **WHEN** a future threshold strategy is discussed
- **THEN** it starts from the measured Indooro baseline and considers low initial bundle/package targets before higher targets for critical services
