## ADDED Requirements

### Requirement: Main iOS screens are audited for accessibility
The canonical app at `swift/indooro-EinkaeuferFinal/` SHALL use `MCindooroAppUITests/AccessibilityAuditUITests` to call XCUITest `performAccessibilityAudit` on the main screens (Start, store map, product search, shopping list, settings, onboarding) with `-uiTesting`, deterministic fixtures and no dependency on live network, BLE or permission prompts. The audits SHALL run in the dedicated workflow `.github/workflows/ios-a11y-audit.yaml` nightly and on demand (`workflow_dispatch`), not in pull-request CI, because a macOS audit cycle takes about 35 minutes and iOS 26 audit findings vary between runs. Reported audit issues SHALL fail the audit run and publish an `.xcresult` artifact and a step summary identifying the screen and issue. Findings SHALL NOT be suppressed to make the audit pass; an exclusion is allowed only for a demonstrated false positive, matched to the exact element, with a comment giving the reason.

#### Scenario: Nightly audit finds an issue
- **GIVEN** the nightly audit workflow runs against `main`
- **WHEN** `performAccessibilityAudit` reports an issue on a main screen
- **THEN** the audit run fails and uploads the `.xcresult` and log for triage, while pull-request CI stays unaffected

#### Scenario: Pull request CI skips the audits
- **GIVEN** a pull request that changes the iOS app
- **WHEN** the `swift-tests` job runs the app unit and UI tests
- **THEN** it skips `AccessibilityAuditUITests` and still runs all other UI tests

#### Scenario: On-demand audit of a branch
- **GIVEN** a developer fixed accessibility findings on a branch
- **WHEN** they dispatch `ios-a11y-audit.yaml` with that branch as `ref`
- **THEN** the audits run against that branch and report the remaining findings
