## MODIFIED Requirements

### Requirement: Logged-in user information is visible
The system SHALL expose the current authenticated admin user's subject, username, email, resolved Indooro role, and Indooro access assignment to the Admin UI so the UI can render user identity, role, scope, and allowed content accurately. Keycloak roles SHALL be used by the backend to verify agreement with the active Indooro assignment, and SHALL only be exposed in the current-user response if the response contract explicitly includes them.

#### Scenario: Admin UI loads current user
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an authenticated user opens the Admin Platform
- **THEN** the Admin UI displays the user's identity and resolved Indooro role context

#### Scenario: User has no active Indooro access assignment
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an authenticated Keycloak user has no active Indooro access assignment
- **THEN** the system rejects protected admin API access with an authorization failure

#### Scenario: Current user lookup returns scoped assignment
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** a `region-manager` or `store-manager` loads the Admin Platform
- **THEN** the current-user response includes the assigned region or store scope needed by the frontend

#### Scenario: Keycloak role exposure is reviewed
- **GIVEN** the backend already compares Keycloak roles with the Indooro assignment role
- **WHEN** the current-user API response is reviewed
- **THEN** the durable API contract states whether raw Keycloak roles are omitted or returned as an explicit field
