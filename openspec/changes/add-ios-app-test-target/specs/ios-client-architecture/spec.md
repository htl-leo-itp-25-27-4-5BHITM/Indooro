## ADDED Requirements

### Requirement: App logic is covered by an XCTest target and CI
The iOS project SHALL contain the unit test target `MCindooroAppTests` hosted by `MCindooroApp`, with tests for backend response decoding from JSON fixtures, shopping list persistence and merging, feature profile and environment parsing, search URL building and study export formatting. A CI workflow SHALL run `swift test` for the navigation package and the app unit tests on a macOS runner for every pull request to `pilot/first-store` and `main`, and a failing test SHALL fail the workflow.

#### Scenario: Decoding regression
- **GIVEN** a change renames a field in `MobileLayoutResponse`
- **WHEN** a pull request is opened
- **THEN** the fixture-based decoding test fails and the CI workflow reports failure

#### Scenario: Windows contributor
- **GIVEN** a team member without a Mac opens a pull request that touches shared JSON fixtures
- **WHEN** CI runs
- **THEN** the Swift tests run on the macOS runner and their result is visible in the pull request
