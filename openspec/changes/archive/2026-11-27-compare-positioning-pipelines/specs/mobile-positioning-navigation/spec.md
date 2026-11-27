## ADDED Requirements

### Requirement: Offline comparison of the current pipeline and the positioning engine
The repository SHALL provide a command line replay that reads one `indooro-recording/2` recording and one layout JSON and runs both the current app pipeline (as `BeaconManager` drives `PositioningPipeline`) and `PositioningEngine` on the same sample sequence, the same virtual clock, the same warm-up and the same layout. It SHALL write, per tick after the warm-up, the truth reference, the displayed position and the confidence of both paths, as CSV and as JSON of schema `indooro-position-comparison/1`, and a text summary per path with median, P90, P95, the share of epochs within 2, 3 and 5 m, the outage rate and the jump rate. The truth reference SHALL be taken from the `truth` markers (identical consecutive markers form a hold, otherwise linear interpolation, none outside the marker range). The replay SHALL NOT change the app target, a feature flag, routing or any network resource. A summary of a recording whose file name starts with `synthetic-` SHALL carry the label SYNTHETIC and SHALL state that it is not a measurement. The summary SHALL state the role and scenario from the `session` line, or that they are missing.

#### Scenario: Synthetic test-room recording
- **GIVEN** `NavigationFixtures/synthetic/synthetic-testraum-2026-10-19-1.jsonl` and its layout
- **WHEN** the comparison runs
- **THEN** the CSV and JSON contain one row per tick with both paths, the summary lists both paths with all seven figures, and the summary is labelled SYNTHETIC

#### Scenario: Same input gives the same output
- **GIVEN** one recording and one layout
- **WHEN** the comparison runs twice
- **THEN** both runs produce byte-identical CSV and JSON

#### Scenario: Both paths agree where they share the core
- **GIVEN** a recording with warm-up set to zero
- **WHEN** the current-pipeline path is compared with `NavigationReplay`
- **THEN** solved point, projected point, confidence and measurement count are equal tick for tick

#### Scenario: Missing truth markers
- **GIVEN** a recording without `truth` lines
- **WHEN** the comparison runs
- **THEN** the tool writes the positions, reports zero epochs with truth, prints no accuracy figure and exits with a message that no evaluation is possible

### Requirement: Pre-registered decision rule for the positioning engine
`docs/pilot-readiness/hardware/POSITIONING_DECISION.md` SHALL state, before any real recording has been compared, which figures decide whether `PositioningEngine` is switched on, the minimum data (at least 3 evaluation runs, otherwise the result is exploratory and the decision is "not yet"), the tolerance below which two figures count as equal, and the possible outcomes. The document SHALL be marked as a proposal until the team confirms it, and SHALL name the limits of the offline comparison. No build SHALL switch the engine on as a result of this change.

#### Scenario: Fewer than three evaluation runs
- **GIVEN** two evaluation runs with a better engine on all figures
- **WHEN** the rule is applied
- **THEN** the result is exploratory and the decision is "not yet"

#### Scenario: Engine better on all figures
- **GIVEN** at least three evaluation runs from the field
- **WHEN** the engine is better on median and P90 by more than the tolerance, and neither the outage rate nor the jump rate is higher
- **THEN** the rule allows the team to propose switching the engine on behind its flag in a separate change
