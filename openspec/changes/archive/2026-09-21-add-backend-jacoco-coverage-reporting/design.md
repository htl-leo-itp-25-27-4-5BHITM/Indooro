## Context

The backend module at `backend/indooro_server` is a Quarkus 3, Java 17, Maven application with JUnit 5, REST Assured, Mockito/Quarkus `@InjectMock`, PostgreSQL/Flyway, OIDC/Keycloak, and OpenSearch integration. Existing Java tests cover several important areas, including mobile recipe resources, admin recipe resources, mobile upsell resources, and `UpsellSuggestionService`.

The project does not currently generate Java backend code coverage reports. This makes it hard to distinguish tested backend behavior from untested service, resource, authorization, and integration paths. The first JaCoCo introduction should create visibility without turning coverage into a blocking quality score.

Coverage reporting is a build/test quality concern, not a product behavior change. It must not change REST contracts, runtime configuration, database schema, frontend behavior, mobile behavior, Keycloak behavior, or deployment runtime resources.

## Goals / Non-Goals

**Goals:**

- Generate reproducible JaCoCo coverage reports for backend Java tests in `backend/indooro_server`.
- Produce local HTML reports for developers.
- Produce XML reports for future CI/SonarQube-style tooling.
- Keep the initial integration non-blocking: tests may fail if tests fail, but coverage percentages must not fail the build in the first implementation.
- Document how to run coverage and how to interpret the first baseline.
- Define Indooro-specific coverage scope boundaries for resources, services, repositories, DTOs, entities, static resources, JavaScript, Swift, Flyway SQL, and Playwright tests.
- Preserve compatibility with the existing Quarkus/JUnit/Surefire setup and the current Byte Buddy test flag.

**Non-Goals:**

- Do not add coverage thresholds in the first implementation.
- Do not treat JaCoCo as proof of test quality or OpenSpec requirement coverage.
- Do not measure Swift, Admin JavaScript, Playwright, httpYac/manual requests, Flyway SQL, static assets, or Kubernetes manifests.
- Do not introduce SonarQube, Codecov, mutation testing, or dead-code analysis as part of this change.
- Do not add or modify product features, APIs, database migrations, auth rules, or deployment runtime manifests.
- Do not refactor existing backend code only to improve coverage numbers.

## Decisions

### Decision 1: Start with report-only Java backend coverage

The first implementation will add coverage report generation but no `check`/threshold gate.

Rationale:
- Indooro has many DTO/entity/config/persistence classes that can distort early aggregate percentages.
- Current tests include resource tests with mocked services, which are valuable but do not prove deep service/database integration.
- A baseline report should be inspected before deciding fair package-level or class-level targets.

Alternatives considered:
- Add immediate bundle thresholds. Rejected for the first implementation because it can block development before baseline interpretation.
- Add strict thresholds only for critical services. Deferred until the first report shows realistic current coverage.

### Decision 2: Use Quarkus JaCoCo support plus the Maven JaCoCo agent for regular unit tests

Implementation uses Quarkus' `quarkus-jacoco` test extension for `@QuarkusTest` classes and `jacoco-maven-plugin` `prepare-agent` for regular unit tests that do not run through the Quarkus test class loader. The Maven agent excludes `*QuarkusClassLoader` and appends to the same execution data file used by Quarkus.

Rationale:
- Maven is the existing backend build system.
- Developers should be able to run coverage from `backend/indooro_server` with a concrete Maven command.
- HTML and XML outputs are standard and easy to consume locally and in CI.
- The backend contains both `@QuarkusTest` resource tests and regular unit tests such as `UpsellSuggestionServiceTest`, so the official Quarkus hybrid setup is a better fit than a plain JaCoCo Maven report.

Alternatives considered:
- Plain `jacoco-maven-plugin` with `prepare-agent` and `report`. Replaced after verification because Quarkus-transformed classes produced JaCoCo class mismatch warnings for some resource/service/repository classes.
- External coverage tooling only in CI. Rejected because developers need local feedback.
- IDE-only coverage. Rejected because it is not reproducible or suitable for CI artifacts.

### Decision 3: Treat coverage scope as Java backend only

The coverage scope will include backend Java code compiled and executed by Maven tests. It will explicitly exclude non-Java surfaces from coverage claims.

In scope:
- `at.htl.resource`
- `at.htl.resource.mobile`
- `at.htl.resource.admin`
- `at.htl.admin.service`
- `at.htl.service`
- Java repositories that contain query or transformation logic
- Java helper/util classes with behavior

Potentially excluded or separately interpreted:
- pure DTO/record containers under `at.htl.admin.dto` and `at.htl.DTO`
- JPA/Panache entities under `at.htl.admin.entity`, `at.htl.admin.entity.recipe`, and simple model packages
- simple Panache repositories with no meaningful logic
- generated/simple config/bootstrap classes without business logic
- Quarkus template/example classes if still present and not part of Indooro behavior

Out of scope:
- Admin JavaScript/CSS/HTML static resources
- Playwright tests
- Swift/iOS code
- Flyway migrations
- PDF/static/image resources
- Kubernetes manifests

### Decision 4: Document report paths and CI consumers without forcing CI gate behavior

The first implementation should document the local report command and report locations, including an HTML report path and an XML report path suitable for future CI/SonarQube-style consumers.

Expected local path shape:
- HTML: `target/site/jacoco/index.html`
- XML: `target/site/jacoco/jacoco.xml`

The final local command is `./mvnw test` from `backend/indooro_server`; if the Maven wrapper is not executable in a local checkout, `sh ./mvnw test` exercises the same wrapper script.

Alternatives considered:
- Only generate HTML. Rejected because XML is the standard machine-readable format for later CI analysis.
- Add CI artifact upload immediately as mandatory. Deferred as optional because the first objective is local baseline generation.

### Decision 5: Preserve Surefire/Byte Buddy compatibility

The backend `pom.xml` currently configures `maven-surefire-plugin` and sets `net.bytebuddy.experimental=true` for tests. JaCoCo integration must not accidentally overwrite or remove Surefire system properties. If an `argLine` is introduced, it must be compatible with JaCoCo agent injection and any existing/future Surefire arguments.

Rationale:
- Quarkus/Mockito/Byte Buddy instrumentation can be sensitive to Java version and test JVM arguments.
- JaCoCo works by bytecode instrumentation, so conflicts should be diagnosed early.

## Risks / Trade-offs

- JaCoCo agent conflicts with Quarkus test instrumentation -> Verify with the existing `@QuarkusTest`, REST Assured, Mockito, and service tests; switch to Quarkus JaCoCo support if needed.
- Surefire `argLine` overwrites the JaCoCo agent -> Use Maven property patterns that preserve JaCoCo-injected JVM arguments.
- DTO/entity-heavy packages distort aggregate coverage -> Define exclusions or clearly document separate interpretation before thresholds.
- Resource tests with mocks look well-covered while service integration remains shallow -> Interpret resource and service coverage separately.
- Coverage percentage is mistaken for quality percentage -> Documentation must state what JaCoCo can and cannot prove.
- Thresholds block development too early -> Keep initial change report-only and propose thresholds as a later follow-up.
- CI looks for reports in the wrong module/path -> Document commands relative to `backend/indooro_server` and verify generated paths.
- Integration tests are not included in the normal unit-test phase -> Confirm whether `*IT` tests are intended for Surefire, Failsafe, or a future integration-test coverage setup before making claims.

## Migration Plan

1. Add the chosen JaCoCo integration to the backend Maven build.
2. Run backend Java tests with coverage from `backend/indooro_server`.
3. Verify HTML and XML reports are generated at documented paths.
4. Confirm existing tests still pass with Quarkus, Mockito, REST Assured, and Byte Buddy settings.
5. Document the local command, report paths, scope boundaries, and initial interpretation policy.
6. Optionally add CI report generation or artifact upload without coverage thresholds.
7. Defer threshold checks to a later OpenSpec change after baseline review.

Rollback is straightforward: remove the JaCoCo build integration and documentation entries. No database, runtime deployment, API, or product data rollback is required.

## Open Questions

- Should the implementation prefer `jacoco-maven-plugin` directly or Quarkus JaCoCo test support if both work locally?
- Should DTO/entity excludes be applied immediately, or should the first report include everything and then inform an explicit exclude follow-up?
- Should CI artifact upload be included in this change or kept as a follow-up after local reporting works?
- Should `ExampleResource` and `ExampleResourceTest/IT` be treated as real backend coverage targets or template leftovers to exclude/remove in a separate cleanup?
