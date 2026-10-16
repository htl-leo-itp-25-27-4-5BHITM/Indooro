## ADDED Requirements

### Requirement: Rebuilt admin assets deploy through Quarkus
The replacement frontend SHALL build reproducibly into static assets served by the existing Quarkus application under authenticated `/admin/*` routes. Direct links, refreshes, cache behavior, and logout SHALL work in both local and packaged runtime.

#### Scenario: Protected direct link is refreshed
- **WHEN** an authenticated staff user refreshes `/admin/stores/detail/?storeId=<id>` after that route is migrated
- **THEN** Quarkus serves the replacement entry, the page restores store context, and the backend applies the user's scope

#### Scenario: Anonymous user requests a migrated route
- **WHEN** an anonymous browser requests a migrated `/admin/*` URL
- **THEN** the existing OIDC login flow applies before protected assets or data are shown

### Requirement: Admin route cutover is reversible
Each route migration SHALL have a recorded parity check, package verification, and a documented way to restore the prior static route without database rollback or loss of previously saved data.

#### Scenario: New route fails release checks
- **WHEN** a migrated route fails its smoke, role/scope, accessibility, or compatibility check before deployment
- **THEN** the build remains on the previous route implementation and the failure is tracked for correction
