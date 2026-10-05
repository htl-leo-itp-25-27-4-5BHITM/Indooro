# android-planning-governance Specification

## Purpose
Definiert die prüfbare Planung einer nativen Android-Parität. Diese Baseline dokumentiert den Planungsprozess, keine ausgelieferte Android-Funktion.

## Requirements

### Requirement: Planning evidence distinguishes observation and target
Android planning artifacts SHALL distinguish code-verified iOS behavior, documentation, assumptions and unknowns, and SHALL link each parity item to an Android change and a future verification case.

#### Scenario: An iOS defect is found
- **GIVEN** static source review finds a behavior that violates a root requirement
- **WHEN** the parity matrix records it
- **THEN** the observed defect and corrected Android target are separate and the root dependency is named

### Requirement: Shared contracts retain a single owner
Android changes MUST reference root backend specifications and SHALL NOT redefine server contracts as Android-owned requirements.

#### Scenario: A missing category route blocks parity
- **GIVEN** the existing catalog route cannot provide store-scoped complete category results
- **WHEN** Android planning describes category browsing
- **THEN** a root contract decision gates integration and no nonexistent endpoint is presented as implemented

### Requirement: Nested planning validates independently
The Android project SHALL validate all its changes and specs from android/ using the repository-pinned OpenSpec CLI and SHALL keep implementation tasks unchecked until separately implemented.

#### Scenario: Both OpenSpec projects exist
- **GIVEN** root and android/ each contain openspec/
- **WHEN** Android validation runs from android/
- **THEN** its report identifies only Android changes and the planning governance spec; root validation is recorded separately
