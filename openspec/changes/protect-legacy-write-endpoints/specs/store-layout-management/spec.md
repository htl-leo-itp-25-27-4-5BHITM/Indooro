## ADDED Requirements

### Requirement: Legacy global layout writes require the admin role
The backend SHALL accept `POST /api/layout/current` only from authenticated users with the `admin` role, SHALL keep `GET /api/layout/current`, `GET /api/layout/history`, and `GET /api/layout/versions/{layoutId}` anonymous, and SHALL record the saving admin in the audit log.

#### Scenario: Admin saves the legacy layout
- **GIVEN** an admin uses the editor in legacy mode
- **WHEN** they save the layout
- **THEN** the backend stores a new history entry and returns its `layoutId` and `savedAt`

#### Scenario: Store manager saves the legacy layout
- **GIVEN** a store manager uses the editor in legacy mode
- **WHEN** they save the layout
- **THEN** the backend responds with HTTP 403 and the editor shows the permission error

#### Scenario: iOS loads the default layout
- **GIVEN** no session
- **WHEN** the iOS app requests `GET /api/layout/current`
- **THEN** the layout is returned
