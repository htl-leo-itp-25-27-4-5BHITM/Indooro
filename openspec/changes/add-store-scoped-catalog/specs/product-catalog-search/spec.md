## ADDED Requirements

### Requirement: Products belong to exactly one store
Every product document SHALL carry `storeId` and `storeCode` of exactly one store. Mobile product search and product listing SHALL return only products of the requested store, and requests without a store SHALL return only products of the configured default store. Admin product reads and writes SHALL require a store and SHALL enforce region and store scope.

#### Scenario: Pilot store search
- **GIVEN** the demo store and the pilot store both contain a product named „Backpulver“
- **WHEN** the app searches „Backpulver“ with the pilot store's `storeCode`
- **THEN** only the pilot store's product with its layout code is returned

#### Scenario: Store manager scope
- **GIVEN** a store manager of the pilot store
- **WHEN** they try to update a product of the demo store
- **THEN** the backend responds with HTTP 403
