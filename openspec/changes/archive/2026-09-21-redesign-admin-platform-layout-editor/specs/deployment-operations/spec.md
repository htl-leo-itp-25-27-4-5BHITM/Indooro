## ADDED Requirements

### Requirement: Admin frontend deployment remains traceable
The redesigned Admin Platform and layout editor SHALL be built and deployed through a traceable process that serves the resulting assets from the existing backend public host and keeps `/admin/`, `/admin/editor/`, and `/admin/server-logs/` under the configured authentication boundary.

#### Scenario: Redesigned admin assets are deployed
- **WHEN** the backend image or static asset bundle containing the redesigned Admin Platform is deployed
- **THEN** `/admin/`, `/admin/regions/`, `/admin/stores/`, `/admin/stores/detail/`, `/admin/beacons/`, `/admin/products/`, `/admin/recipes/`, `/admin/editor/`, and `/admin/server-logs/` resolve through the backend host according to the existing protected route policy

#### Scenario: Frontend build dependency is introduced
- **WHEN** the implementation introduces a frontend build tool or package dependency
- **THEN** the repository documents local build commands, CI/build integration, asset output location, and rollback behavior for the Quarkus-served Admin Platform

### Requirement: Admin redesign verification covers UX-critical routes
Deployment verification SHALL include representative checks for redesigned admin shell rendering, protected-route behavior, role-aware navigation, core list pages, store detail, layout editor canvas, save/publish affordances, and public mobile/customer route preservation.

#### Scenario: Protected admin route is verified
- **WHEN** deployment verification runs after the redesign
- **THEN** at least one protected Admin Platform route confirms login/authorization behavior and at least one authenticated smoke path verifies page rendering

#### Scenario: Public route is verified
- **WHEN** deployment verification runs after the redesign
- **THEN** representative public mobile/customer routes remain accessible without Admin Platform login
