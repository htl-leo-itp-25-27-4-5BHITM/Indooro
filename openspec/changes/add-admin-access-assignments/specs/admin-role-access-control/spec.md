## ADDED Requirements

### Requirement: Admins manage access assignments in the admin UI
The system SHALL let only users with the role `admin` list, create and deactivate access assignments through `/api/admin/access-assignments` and the admin page "Zugänge", without SQL. A created assignment SHALL be `ACTIVE`. A `store-manager` assignment SHALL reference exactly one active store and no region; a `region-manager` assignment SHALL reference exactly one active region and no store; an `admin` assignment SHALL reference neither. The system SHALL reject a second active assignment for the same Keycloak subject with 409. The system SHALL reject deactivating the caller's own assignment with 409. Every create and every deactivation SHALL write an audit log entry of type `USER_ACCESS`. Keycloak users and realm roles SHALL still be created in the Keycloak console; the backend SHALL NOT call the Keycloak admin API.

#### Scenario: Admin creates a store manager for one store
- **GIVEN** a signed-in admin and an active store
- **WHEN** the admin creates an assignment with a Keycloak subject, role `store-manager` and that store
- **THEN** the system stores an active assignment with that store and no region, writes a `USER_ACCESS` `CREATE` audit entry, and the new user's admin requests are scoped to that store only

#### Scenario: Store manager without store
- **GIVEN** a signed-in admin
- **WHEN** the admin creates a `store-manager` assignment without a store, or a `region-manager` assignment without a region
- **THEN** the system rejects the request with 400 and stores nothing

#### Scenario: Second active assignment for a subject
- **GIVEN** an active assignment for a Keycloak subject
- **WHEN** an admin creates another assignment for the same subject
- **THEN** the system rejects the request with 409

#### Scenario: Deactivation
- **GIVEN** an active assignment of another user
- **WHEN** the admin deactivates it
- **THEN** the assignment status is `DISABLED`, a `USER_ACCESS` `DEACTIVATE` audit entry is written, and the user's next protected admin request is rejected

#### Scenario: Non-admin roles
- **GIVEN** a signed-in `region-manager` or `store-manager`
- **WHEN** the user calls any access assignment endpoint or opens the page "Zugänge"
- **THEN** the API answers 403 and the admin UI shows access denied without calling the access assignment API

### Requirement: Users without access see their own Keycloak subject
The system SHALL return the token subject, username and email of any signed-in user from `GET /api/admin/me/identity`, also without a role or access assignment, and SHALL answer 401 to anonymous requests. When `/api/admin/me` answers 403, the admin UI SHALL show this subject on the access-denied page with a copy action, so the user can hand it to an admin.

#### Scenario: Signed-in user without assignment
- **GIVEN** a user signed in through Keycloak without an active access assignment
- **WHEN** the user opens the admin UI
- **THEN** the page shows "Zugriff verweigert" and the user's Keycloak subject with a copy button

#### Scenario: Expired session
- **GIVEN** a browser without a valid session
- **WHEN** `/api/admin/me` answers 401
- **THEN** the admin UI shows the session message and no subject
