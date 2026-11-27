## ADDED Requirements

### Requirement: Main iOS screens pass automated accessibility audits
The canonical app at `swift/indooro-EinkaeuferFinal/` SHALL use `MCindooroAppUITests` to call XCUITest `performAccessibilityAudit` on the Start, Planung, Rezepte, Einkaufen and Karte tabs and representative search, tour and dialog states. Audits SHALL run with `-uiTesting`, deterministic fixtures and no dependency on live network, BLE or permission prompts, on an audit-capable iOS simulator in macOS pull-request CI targeting `main` and `pilot/first-store`. Reported audit issues SHALL fail the test and CI, with an `.xcresult` artifact identifying the failing screen and issue. CI SHALL execute the audits rather than silently skipping unsupported runtimes; findings SHALL NOT be suppressed to make the gate pass.

#### Scenario: Main tab fails audit
- **GIVEN** the fixture-driven app has opened the Planung tab
- **WHEN** `performAccessibilityAudit` reports an issue
- **THEN** the UI test and CI fail and publish the audit result for diagnosis

#### Scenario: Offline fixture run passes
- **GIVEN** live network and BLE are unavailable
- **WHEN** CI opens every required fixture state and runs the accessibility audits
- **THEN** all audits execute without permission prompts and CI passes only when no audit issues remain
