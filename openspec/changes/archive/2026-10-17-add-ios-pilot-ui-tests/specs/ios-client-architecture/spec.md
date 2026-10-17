## ADDED Requirements

### Requirement: Pilot flows are covered by UI tests in fixture mode
The iOS project SHALL contain the UI test target `MCindooroAppUITests`. Launched with `-uiTesting`, the app SHALL use bundled fixture data without network, BLE or permission prompts. UI tests SHALL cover product search with special characters, shelf location text, tour start from the entrance, completing a stop, setting the position with „Ich bin hier“, and offline start, and SHALL run in CI for pull requests to `pilot/first-store`.

#### Scenario: Tour regression
- **GIVEN** a pull request breaks the route fallback after „Erledigt“
- **WHEN** CI runs the UI tests
- **THEN** the tour test fails and the workflow reports failure
