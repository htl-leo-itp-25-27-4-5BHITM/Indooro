# admin-authentication Specification

## Purpose
Defines how the Indooro Admin Platform uses Keycloak-backed Quarkus OIDC web-app authentication, session state, logout, current-user identity, protected admin routes, and public customer/mobile route boundaries.
## Requirements
### Requirement: Admin platform requires login
The system SHALL require a Keycloak-backed Quarkus OIDC web-app session before serving protected Admin Platform pages under `/admin` and `/admin/*`, while still allowing required static assets and the configured login callback/logout paths to function.

#### Scenario: Anonymous user opens admin overview
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an anonymous user requests `/admin/`
- **THEN** the system redirects the user into the Keycloak login flow

#### Scenario: Authenticated user opens admin overview
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an authenticated user with an allowed admin role requests `/admin/`
- **THEN** the system serves the Admin Platform page

#### Scenario: Authenticated user changes account after logout/login
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** a user logs out and then logs in with a different Keycloak account
- **THEN** the Admin Platform loads identity and scoped content for the new account rather than reusing stale data from the previous session

### Requirement: Admin APIs require authentication
The system SHALL require authentication for `/api/admin/logs`, `/api/admin/error-logs`, `/api/regions`, `/api/stores`, `/api/beacons`, and `/api/stores/{storeId}/layout/*`, then SHALL evaluate role and scope authorization before returning protected admin data.

#### Scenario: Anonymous API request
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an anonymous client requests a protected admin API endpoint
- **THEN** the system rejects the request without returning admin data

#### Scenario: Authenticated API request
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an authenticated user with an allowed role requests a protected admin API endpoint
- **THEN** the system evaluates role and scope rules before returning data

#### Scenario: Authenticated user has no matching assignment
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an authenticated Keycloak user has no active Indooro access assignment
- **THEN** the system rejects protected admin API access without returning protected data

### Requirement: Public routes stay public
The system SHALL keep anonymous customer/mobile routes accessible without Admin Platform login, including `/api/mobile/stores`, `/api/mobile/stores/by-beacon`, `/api/mobile/stores/beacon-identities`, `/api/mobile/stores/{storeId}/layout/current`, `/api/products`, `/api/categories`, and `/api/layout` unless a future OpenSpec change explicitly changes the boundary.

#### Scenario: Anonymous mobile store lookup
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an anonymous mobile client requests `/api/mobile/stores/by-beacon`
- **THEN** the system processes the request without redirecting to Keycloak

#### Scenario: Anonymous mobile beacon identities lookup
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an anonymous mobile client requests `/api/mobile/stores/beacon-identities`
- **THEN** the system processes the request without requiring an admin session

#### Scenario: Anonymous catalog lookup
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an anonymous client requests `/api/products`
- **THEN** the system processes the request without requiring an admin session

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

### Requirement: Logout ends admin session
The system SHALL provide a logout action that ends the Quarkus OIDC web-app session, triggers the configured Keycloak logout behavior where applicable, clears protected UI state, and returns the user to a non-admin landing path.

#### Scenario: User logs out
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an authenticated admin user activates logout
- **THEN** the system ends the admin session and returns the user to the configured post-logout page

#### Scenario: User revisits admin after logout
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** a logged-out user requests `/admin/`
- **THEN** the system starts a fresh Keycloak login flow

#### Scenario: Logout button is clicked repeatedly
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** a user clicks logout more than once during session termination
- **THEN** the UI does not show stale protected content and the backend does not treat the user as still authorized without a fresh session

### Requirement: Unauthorized behavior is explicit
The system SHALL return explicit authentication or authorization failure behavior for anonymous users, authenticated users without allowed roles, and authenticated users whose roles or scopes do not allow a protected admin action.

#### Scenario: Authenticated user lacks admin role
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** an authenticated Keycloak user without `admin`, `region-manager`, or `store-manager` requests a protected admin API
- **THEN** the system rejects the request without returning admin data

#### Scenario: Admin UI receives authorization failure
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** the Admin UI receives an authorization failure from a protected admin API
- **THEN** the Admin UI shows a clear access denied state instead of rendering stale or partial protected data

#### Scenario: API client receives authorization failure
- **GIVEN** Admin Platform authentication and route policies are configured
- **WHEN** a protected admin API denies access due to role or scope
- **THEN** the response communicates failure through the appropriate HTTP status and does not include protected resource data

