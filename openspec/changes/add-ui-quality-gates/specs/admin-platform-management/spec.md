## ADDED Requirements

### Requirement: Admin UI visual regressions fail CI
The `admin-ui` browser suite SHALL compare representative dashboard, management list, form/dialog and layout editor screenshots using Playwright `toHaveScreenshot` at viewport widths 390, 768 and 1440 px. It SHALL use fixed fixture data, `reducedMotion: "reduce"`, `animations: "disabled"`, stable readiness checks and masks for volatile dates, identifiers and nondeterministic maps/canvas. Each comparison SHALL use `maxDiffPixelRatio` at most 0.01. CI SHALL run on `ubuntu-24.04` with platform-specific Linux baselines, upload expected/actual/diff diagnostics on failure and fail on missing baselines or excessive differences during normal comparison.

#### Scenario: Admin layout regresses
- **GIVEN** reviewed Linux baselines exist for all three widths
- **WHEN** a pull request changes an unmasked admin layout beyond the configured threshold at any width
- **THEN** the visual CI job fails and publishes comparison diagnostics identifying that view and viewport

#### Scenario: Admin baselines are bootstrapped
- **GIVEN** the first implementation push lacks Linux baselines and the developer has no Docker on the Mac
- **WHEN** the explicit bootstrap run uses `--update-snapshots=missing` on `ubuntu-24.04`
- **THEN** CI uploads the snapshot folder for download with `gh run download`, review and commit
- **AND** a subsequent push runs strict comparison without snapshot updates before the package is accepted

### Requirement: Admin UI accessibility violations fail CI
The `admin-ui` suite SHALL run `@axe-core/playwright` scans with tags `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` on representative dashboard, list, form/dialog and editor states at 390, 768 and 1440 px. Any serious or critical violation SHALL fail CI. Reports SHALL retain rule identifiers, impact, affected nodes and remediation help. Tests SHALL use isolated role/scope fixtures without weakening runtime authentication or existing authorization tests.

#### Scenario: Dialog has a serious accessibility issue
- **GIVEN** an admin fixture has opened a management dialog
- **WHEN** the WCAG-tagged axe scan reports a serious or critical violation
- **THEN** the accessibility job fails and its report identifies the rule and affected nodes

#### Scenario: Lower-impact finding remains visible
- **WHEN** a scan reports only moderate or minor violations
- **THEN** those findings remain in the report and do not fail the serious/critical severity gate
