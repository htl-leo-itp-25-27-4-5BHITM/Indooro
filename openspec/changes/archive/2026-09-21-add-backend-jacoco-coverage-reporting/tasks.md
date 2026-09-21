## 1. Pre-Implementation Review

- [x] 1.1 Re-read `backend/indooro_server/pom.xml` and confirm current Quarkus, Surefire, Java, and Byte Buddy test configuration.
- [x] 1.2 Re-read the current backend Java test layout under `backend/indooro_server/src/test/java`.
- [x] 1.3 Confirm whether `ExampleResource` and `ExampleResourceTest/IT` are real coverage targets or template leftovers to treat separately.
- [x] 1.4 Decide whether the first implementation uses `jacoco-maven-plugin` directly or Quarkus JaCoCo test support if local compatibility requires it.

## 2. Maven Coverage Integration

- [x] 2.1 Add the selected JaCoCo integration to `backend/indooro_server/pom.xml` without changing product dependencies or runtime behavior.
- [x] 2.2 Configure coverage report generation for the Maven test lifecycle with HTML and XML output.
- [x] 2.3 Preserve existing Surefire system properties, including `net.bytebuddy.experimental=true`.
- [x] 2.4 Ensure any Maven JVM argument configuration preserves JaCoCo agent injection and does not overwrite existing or future Surefire arguments.
- [x] 2.5 Keep coverage threshold enforcement disabled in the initial implementation.

## 3. Coverage Scope And Excludes

- [x] 3.1 Define the initial package/class treatment for resources, services, repositories, DTOs, entities, config, generated classes, and example/template classes.
- [x] 3.2 Ensure high-value packages remain visible in the report, including `at.htl.resource`, `at.htl.resource.mobile`, `at.htl.resource.admin`, `at.htl.admin.service`, and `at.htl.service`.
- [x] 3.3 Exclude or document separate interpretation for low-signal Java artifacts such as pure DTO records, simple JPA entities, generated classes, and simple config/bootstrap classes.
- [x] 3.4 Verify repository classes with custom query or transformation logic are not excluded solely because they are repositories.

## 4. Documentation

- [x] 4.1 Document the backend coverage command from `backend/indooro_server`.
- [x] 4.2 Document the generated HTML and XML report paths.
- [x] 4.3 Document that JaCoCo covers backend Java bytecode executed by Maven tests only.
- [x] 4.4 Document non-covered surfaces: Swift, Admin JavaScript, Playwright, httpYac/manual API checks, Flyway SQL, static resources, and Kubernetes manifests.
- [x] 4.5 Document that the first coverage integration is report-only and does not enforce thresholds.
- [x] 4.6 Document future threshold guidance as a follow-up decision after baseline review.

## 5. Optional CI Artifact Integration

- [x] 5.1 Inspect existing CI configuration, if any, before adding coverage-related CI behavior.
- [x] 5.2 If CI is in scope for this implementation, add backend coverage report generation without failing builds on coverage percentages.
- [x] 5.3 If CI is in scope for this implementation, publish or retain JaCoCo HTML/XML artifacts from the backend module path.
- [x] 5.4 If CI is not in scope, document CI coverage artifact upload as a follow-up task.

## 6. Verification

- [x] 6.1 Run the backend Maven coverage command from `backend/indooro_server`.
- [x] 6.2 Verify all existing backend Java tests still pass or document any pre-existing unrelated failures.
- [x] 6.3 Verify the HTML report exists and is readable.
- [x] 6.4 Verify the XML report exists for future CI/SonarQube-style consumers.
- [x] 6.5 Inspect the generated report to confirm important resource and service packages appear.
- [x] 6.6 Confirm coverage thresholds are not enforced by the initial implementation.

## 7. OpenSpec Validation And Handoff

- [x] 7.1 Run OpenSpec validation for the change.
- [x] 7.2 Update design/tasks/specs if implementation discoveries require a scoped adjustment.
- [x] 7.3 Summarize the generated baseline report location and any notable interpretation caveats.
- [x] 7.4 Recommend whether threshold enforcement should be a separate follow-up OpenSpec change.
