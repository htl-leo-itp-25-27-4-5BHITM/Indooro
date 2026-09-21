## ADDED Requirements

### Requirement: Legacy documentation conflicts are resolved through OpenSpec and source verification
The project SHALL treat older documentation files as historical source material when they conflict with current OpenSpec specs or verified source code. Current behavior SHALL be documented in OpenSpec, and any future implementation change SHALL update OpenSpec rather than relying on stale sprint notes.

#### Scenario: Old sprint documentation conflicts with source
- **GIVEN** a documentation file claims a feature is not implemented
- **WHEN** current source code and OpenSpec show the feature is implemented and validated
- **THEN** future planning treats the old statement as historical context rather than current truth

#### Scenario: Future change uses documentation folder input
- **GIVEN** a future OpenSpec change references files from `documentation/`
- **WHEN** a claim affects runtime behavior, APIs, security, data model, or mobile behavior
- **THEN** the change verifies the claim against current source or current OpenSpec before treating it as a requirement
