## ADDED Requirements

### Requirement: iOS app consumes beacon-based store lookup
The iOS app SHALL use the public mobile beacon lookup API to resolve the active store when automatic beacon-based store detection is enabled, and SHALL fall back to manual store selection when lookup is unavailable, ambiguous, or denied by backend validation.

#### Scenario: Beacon detection resolves a store
- **GIVEN** the iOS app detects a beacon identity with UUID and optional major/minor values
- **WHEN** automatic store detection is active
- **THEN** the app calls `/api/mobile/stores/by-beacon` with the detected identity and loads `/api/mobile/stores/{storeId}/layout/current` for the returned store

#### Scenario: Beacon lookup is ambiguous
- **GIVEN** the backend returns a conflict or no usable store match for a detected beacon identity
- **WHEN** the iOS app handles the lookup result
- **THEN** it keeps the current store context or asks the customer to choose a store manually instead of switching to a guessed store

#### Scenario: Manual selection remains available
- **GIVEN** automatic beacon lookup fails or Bluetooth is unavailable
- **WHEN** the customer opens store selection
- **THEN** the app can load active stores from `/api/mobile/stores` and continue with a manually selected store
