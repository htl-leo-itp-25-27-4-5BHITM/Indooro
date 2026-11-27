## ADDED Requirements

### Requirement: Pilot showcase visual regressions fail CI
The `pilot-showcase` suite SHALL use Playwright `toHaveScreenshot` to compare the initial page, representative content tabs and tour state at viewport widths 390, 768 and 1440 px. It SHALL use fixed fixture data, stable readiness checks, `reducedMotion: "reduce"`, `animations: "disabled"`, masks for volatile dates/identifiers and nondeterministic maps/canvas, and `maxDiffPixelRatio` at most 0.01. CI SHALL run on `ubuntu-24.04` with Linux-specific baselines and fail on excessive differences or missing snapshots in normal comparison, publishing expected/actual/diff diagnostics.

#### Scenario: Showcase regresses at tablet width
- **GIVEN** a reviewed baseline for the same fixture and platform exists
- **WHEN** the 768 px screenshot exceeds the configured difference threshold
- **THEN** the visual job fails and publishes the screenshot comparison

### Requirement: Customer finder and landing visual regressions fail CI
The customer web and landing suite SHALL use Playwright `toHaveScreenshot` at viewport widths 390, 768 and 1440 px for the landing page and `/customer/` store selection, product results and map/list state. It SHALL use fixed fixture data, stable readiness checks, reduced motion, disabled screenshot animations, masks for volatile dates/identifiers and nondeterministic maps/canvas, and `maxDiffPixelRatio` at most 0.01. CI SHALL run on `ubuntu-24.04` against Linux-specific baselines and fail on excessive differences or missing baselines in normal comparison, with expected/actual/diff artifacts.

#### Scenario: Customer search layout regresses
- **GIVEN** a fixed store and product search result fixture
- **WHEN** an unmasked result layout exceeds the allowed difference at 390 px
- **THEN** the customer visual job fails with comparison diagnostics

### Requirement: Public web baselines are reviewed before strict acceptance
The showcase and customer/landing suites SHALL support an explicit first-push Linux bootstrap using `--update-snapshots=missing`, upload their snapshot folders as artifacts and document `gh run download`, review and commit of those baselines. Subsequent CI runs SHALL compare strictly without snapshot updates; a bootstrap run alone SHALL NOT establish acceptance. macOS snapshots SHALL NOT replace Linux baselines. Later intentional visual changes SHALL require reviewed baseline commits.

#### Scenario: Public baseline bootstrap completes
- **GIVEN** the developer Mac has no Docker and the first implementation push lacks Linux snapshots
- **WHEN** CI generates missing snapshots on `ubuntu-24.04`
- **THEN** the developer can download and review each suite's snapshots, commit them and obtain a strict passing comparison on the next push

#### Scenario: Snapshot is accidentally removed
- **GIVEN** bootstrap has completed
- **WHEN** a pull request removes a required Linux baseline
- **THEN** strict CI fails instead of silently generating an accepted replacement

### Requirement: Public web accessibility violations fail CI
The showcase and customer/landing suites SHALL scan their visual-test page states with `@axe-core/playwright` using `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` tags at 390, 768 and 1440 px. Serious and critical violations SHALL fail CI; reports SHALL include all findings with rule identifiers, impact, affected nodes and remediation help. The customer and landing scans SHALL run anonymously with fixture data.

#### Scenario: Showcase navigation is inaccessible
- **WHEN** axe reports a serious or critical violation in an active showcase tab or tour state
- **THEN** the showcase accessibility job fails and publishes the affected rule and nodes

#### Scenario: Customer or landing has an accessibility regression
- **GIVEN** the anonymous customer results page or landing page is ready
- **WHEN** its WCAG-tagged scan finds a serious or critical violation
- **THEN** the customer/landing accessibility job fails with actionable diagnostics
