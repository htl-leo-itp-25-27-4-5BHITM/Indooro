## ADDED Requirements

### Requirement: Technical and visual checks are recorded
The production SHALL run typechecking, OpenSpec validation, targeted frame renders, transition-frame inspection, and media probe checks, then record actual results in `indooro-production-report.md`. Verification: inspect commands and output evidence in the report.

#### Scenario: The report is delivered
- **WHEN** the final report is opened
- **THEN** it distinguishes passed checks, observed fixes, and remaining limitations

### Requirement: Full film is reviewed as one experience
The production SHALL inspect the complete export for pacing, text legibility, route visibility, clipping, and continuity. Verification: review the final preview and record specific observations.

#### Scenario: Transition issue is found
- **WHEN** a boundary has a blank or jarring frame
- **THEN** source is corrected and the affected stills are rerendered before final delivery

### Requirement: Content is verified against current product scope
Every displayed feature and label SHALL be checked against the current project documentation and code status. Verification: claim checklist in the production report.

#### Scenario: Positioning visualization is reviewed
- **WHEN** beacon and Blue Dot visuals are shown
- **THEN** they are described as an explanatory concept and no unsupported accuracy or live deployment claim appears
