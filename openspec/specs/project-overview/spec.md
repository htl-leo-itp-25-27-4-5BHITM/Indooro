# project-overview Specification

## Purpose
Defines the durable Indooro project mission, MVP boundaries, stakeholders, source documentation, FSD expectations, and OpenSpec governance rules that future changes must preserve.
## Requirements
### Requirement: Indooro mission is explicit
Indooro SHALL be specified as a system that helps anonymous supermarket customers find products inside a selected or detected store and helps authorized staff manage the store data required for that experience.

#### Scenario: Future change starts from OpenSpec
- **GIVEN** the Indooro project scope and OpenSpec governance context are being evaluated
- **WHEN** a future change proposes new mobile, admin, catalog, layout, or deployment behavior
- **THEN** the change can identify whether it supports customer product finding, staff data management, or an explicitly documented future goal

#### Scenario: Server-side customer tracking is proposed
- **GIVEN** the Indooro project scope and OpenSpec governance context are being evaluated
- **WHEN** a future change proposes storing customer identities or live customer positions server-side
- **THEN** the proposal must treat that behavior as new scope and must not assume it is part of the Indooro MVP

### Requirement: MVP boundaries are maintained
The system SHALL treat one-store-at-a-time customer search, one-floor store layouts, one-product route guidance, anonymous customer/mobile use, and authenticated admin management as the MVP baseline. Local/demo app enhancements such as shopping lists or AR route previews SHALL be documented separately and SHALL NOT imply shared backend customer accounts, Android parity, analytics, live inventory, or production-grade multi-product fulfillment unless a future OpenSpec change expands scope.

#### Scenario: Multi-product backend shopping lists are requested
- **GIVEN** the app has local shopping-list assistance
- **WHEN** a future change requests backend-synchronized shopping lists or shared customer accounts
- **THEN** the change must document it as an MVP expansion rather than existing baseline behavior

#### Scenario: Android parity is requested
- **GIVEN** the current mobile implementation is iOS-first
- **WHEN** a future change requests Android application support
- **THEN** the change must define Android-specific requirements instead of assuming the existing iOS MVP covers it

#### Scenario: AR navigation is reviewed
- **GIVEN** AR route preview code exists in the iOS app
- **WHEN** the project MVP boundary is evaluated
- **THEN** standard 2D map guidance remains the baseline customer navigation contract

### Requirement: Stakeholder roles are documented
The system SHALL distinguish anonymous customer/mobile users from authenticated Admin Platform users and SHALL use the admin roles `admin`, `region-manager`, and `store-manager` for protected management workflows.

#### Scenario: Anonymous customer searches products
- **GIVEN** the Indooro project scope and OpenSpec governance context are being evaluated
- **WHEN** an anonymous customer uses public catalog or mobile routes
- **THEN** the system treats the user as a customer/mobile user and does not require Admin Platform login

#### Scenario: Staff member manages store data
- **GIVEN** the Indooro project scope and OpenSpec governance context are being evaluated
- **WHEN** a staff member opens the Admin Platform
- **THEN** the system requires Keycloak authentication and maps the user to one of the documented admin roles before protected data is returned

### Requirement: Source documentation is represented in OpenSpec
OpenSpec SHALL capture the durable project decisions from README, deployment documentation, API documentation, sprint documentation, runtime object diagrams, Keycloak notes, verification notes, and FSD answers.

#### Scenario: Documentation source contains durable behavior
- **GIVEN** the Indooro project scope and OpenSpec governance context are being evaluated
- **WHEN** existing project documentation describes durable behavior or a future requirement
- **THEN** the relevant OpenSpec capability includes that behavior as a requirement, scenario, design note, or known open point

#### Scenario: Documentation conflicts with implemented code
- **GIVEN** the Indooro project scope and OpenSpec governance context are being evaluated
- **WHEN** documentation and code disagree about runtime behavior
- **THEN** a future implementation change must record the conflict in its OpenSpec design and verify the actual behavior before changing code

### Requirement: Ambiguous work uses Functional Specification Discovery
The project SHALL use Functional Specification Discovery before coding when a request is ambiguous, introduces business rules, changes core workflows, or depends on unanswered product decisions.

#### Scenario: Category-code search behavior is unclear
- **GIVEN** the Indooro project scope and OpenSpec governance context are being evaluated
- **WHEN** a future change asks for product search by category code without specifying route, filters, response shape, or store scope
- **THEN** the change must clarify those details through FSD or document explicit assumptions in OpenSpec before implementation

#### Scenario: Layout editor interaction is expanded
- **GIVEN** the Indooro project scope and OpenSpec governance context are being evaluated
- **WHEN** a future change adds editor behaviors such as grouping, snapping, rotation, layers, or validation
- **THEN** the change must capture the interaction and data-contract requirements in OpenSpec before coding

### Requirement: OpenSpec is the durable change contract
Future repository changes SHALL use OpenSpec proposal, specs, design, tasks, verification, and archive artifacts when they modify durable product behavior, architecture, security, deployment, or public API contracts.

#### Scenario: Security behavior changes
- **GIVEN** the Indooro project scope and OpenSpec governance context are being evaluated
- **WHEN** a future change protects a route, makes a route public, changes role behavior, or changes session handling
- **THEN** the change must update the relevant OpenSpec specs and pass validation before being considered done

#### Scenario: Documentation-only consolidation occurs
- **GIVEN** the Indooro project scope and OpenSpec governance context are being evaluated
- **WHEN** project documentation is consolidated without runtime code changes
- **THEN** the OpenSpec change still records the proposal, design, tasks, specs, validation, and archive trail

### Requirement: Legacy documentation is audit input, not runtime truth by itself
OpenSpec SHALL preserve durable decisions from legacy documentation, but SHALL resolve conflicts by checking current code, current specs, and current deployment context before treating old statements as runtime truth.

#### Scenario: Legacy doc predates Keycloak
- **GIVEN** a legacy document says admin APIs were anonymous before the Keycloak sprint
- **WHEN** a future change evaluates current admin security behavior
- **THEN** the current Keycloak-protected OpenSpec requirements and code configuration take precedence

#### Scenario: Legacy doc describes a future wish
- **GIVEN** a legacy FSD answer describes a desired future feature
- **WHEN** the feature is not implemented or not archived into current specs
- **THEN** OpenSpec must mark it as future/planned rather than current runtime behavior

### Requirement: Language scope is explicit
The project SHALL treat English as the preferred language for OpenSpec, code-facing artifacts, and agent instructions, while customer/admin UI language support may include German and English when explicitly scoped.

#### Scenario: New OpenSpec artifact is created
- **GIVEN** a future change creates specs, design, or tasks
- **WHEN** artifact text is written
- **THEN** it should use English for durable technical requirements unless the user asks otherwise

#### Scenario: Customer multilingual UX is requested
- **GIVEN** FSD identified German and English as desired UI languages
- **WHEN** a future change implements multilingual customer/admin UI
- **THEN** the change must define supported locales, fallback language, translated surfaces, and test expectations

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

