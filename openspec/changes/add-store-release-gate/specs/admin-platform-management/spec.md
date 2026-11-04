## ADDED Requirements

### Requirement: New stores stay out of the customer market list until an admin releases them
A store created through the admin API SHALL be unreleased. `GET /api/mobile/stores` SHALL list only stores that are active and released; its response shape SHALL NOT change. Stores that existed before the release gate SHALL stay released. Only an administrator SHALL release a store (`PATCH /api/stores/{storeId}/release`) or withdraw its release (`PATCH /api/stores/{storeId}/withdraw`); both SHALL be idempotent and SHALL write an audit entry when the state changes. Releasing an archived store SHALL fail with 409. The store detail page SHALL show the release state and offer both actions to administrators only. The release SHALL NOT depend on the readiness verdict.

#### Scenario: New store is hidden
- **GIVEN** an administrator creates a store
- **WHEN** a customer loads `GET /api/mobile/stores`
- **THEN** the new store is not in the list

#### Scenario: Release and withdraw
- **GIVEN** an unreleased active store
- **WHEN** an administrator releases it
- **THEN** it appears in `GET /api/mobile/stores`, and after a withdraw it is gone again

#### Scenario: Other roles
- **WHEN** a region manager or store manager calls release or withdraw
- **THEN** the server answers 403 and the store page shows no button
