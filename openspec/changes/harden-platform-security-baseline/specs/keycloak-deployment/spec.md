## ADDED Requirements

### Requirement: Production realm contains no preset credentials
The LeoCloud realm import SHALL NOT contain users, passwords, or client secrets. Demo users with fixed passwords SHALL exist only in the development realm `keycloak/realm/indooro-realm.json`. Indooro access assignments for the demo subjects `11111111-1111-1111-1111-111111111111`, `22222222-2222-2222-2222-222222222222`, and `33333333-3333-3333-3333-333333333333` SHALL be disabled outside the development and test profiles.

#### Scenario: Demo login is attempted on LeoCloud
- **GIVEN** the production deployment
- **WHEN** someone tries to log in as `indooro-admin` with password `admin`
- **THEN** Keycloak rejects the login

#### Scenario: The production backend starts
- **GIVEN** the `prod` profile with Flyway placeholder `demoAccess=false`
- **WHEN** migrations run
- **THEN** the three demo access assignments have status `DISABLED`

### Requirement: Production Keycloak runs in production mode with persistent storage
The LeoCloud Keycloak SHALL run the latest supported 26.x release with `start` (not `start-dev`), SHALL store its data in PostgreSQL, SHALL read the bootstrap administrator from a secret that is not tracked in Git, and SHALL survive pod restarts without losing users, sessions, or realm settings.

#### Scenario: The Keycloak pod restarts
- **GIVEN** an admin user created after deployment
- **WHEN** the Keycloak pod is deleted and recreated
- **THEN** the admin user still exists and can log in

#### Scenario: The manifests are reviewed
- **GIVEN** `k8s/keycloak.yaml`
- **WHEN** it is searched for passwords and client secrets
- **THEN** it contains only secret references

### Requirement: Production client and realm resist credential attacks
The production realm SHALL enable brute-force detection, SHALL enforce a password policy of at least 12 characters that differs from the username, SHALL require SSL for external requests, and SHALL configure the client `indooro-admin-web` without the resource owner password grant and with redirect URIs and web origins restricted to the public host.

#### Scenario: A password grant is attempted
- **GIVEN** the production client
- **WHEN** a client posts `grant_type=password` to the token endpoint
- **THEN** Keycloak rejects the request

#### Scenario: Repeated wrong passwords are submitted
- **GIVEN** a production user
- **WHEN** ten wrong passwords are submitted in a row
- **THEN** the account is temporarily locked

### Requirement: Keycloak administration is not publicly routed
The LeoCloud ingress SHALL route only the realm and resource paths of Keycloak (`/keycloak/realms/` and `/keycloak/resources/`) and SHALL NOT route the administration console; operators SHALL reach the console through `kubectl port-forward`.

#### Scenario: The admin console is requested publicly
- **GIVEN** the public host
- **WHEN** a browser requests `/keycloak/admin/`
- **THEN** the request is not forwarded to Keycloak

#### Scenario: An operator administers the realm
- **GIVEN** cluster credentials for the namespace
- **WHEN** the operator runs `kubectl -n student-it220209 port-forward deployment/indooro-keycloak 8180:8080`
- **THEN** the console is reachable at `http://localhost:8180/keycloak/admin/`
