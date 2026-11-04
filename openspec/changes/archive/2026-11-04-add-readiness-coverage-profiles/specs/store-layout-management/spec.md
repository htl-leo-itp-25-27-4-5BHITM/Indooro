## ADDED Requirements

### Requirement: Readiness coverage uses a per-store profile and never reports uncomputed coverage
Each store SHALL have a coverage profile (`stores.readiness_profile`, default `market`). The profile `market` SHALL be the top-level values of `readiness/coverage-rule.json` (unchanged); other profiles SHALL be defined under `profiles` in the same file, override only the fields they name and inherit the rest. The store readiness report SHALL evaluate the coverage with the store's profile, SHALL use the profile's radius when no `radius` parameter is given, and SHALL return `profile`, `minBeaconsPerCell` and `maxLowCoverageShare` next to the radius. Only role `admin` SHALL change a store's profile; an unknown profile id SHALL be rejected with HTTP 400. The report SHALL set `coverageComputed` to false when no coverage was calculated (no active layout, or a grid that is missing, smaller than 1 m or larger than 1 000 000 cells) and, for an active layout, SHALL add the warning `COVERAGE_NOT_COMPUTED`; the admin readiness page SHALL then show "Abdeckung nicht berechnet" and SHALL NOT show a coverage share. A profile SHALL NOT skip the calculation, and the page SHALL show the profile, the rule and the computed share together.

#### Scenario: Empty test room with the testroom profile
- **GIVEN** an empty 20×20 m layout with nine beacons in a 3×3 raster, registered, and a store with profile `testroom`
- **WHEN** the readiness report is evaluated without a radius
- **THEN** the radius is 10 m, 8 of 400 cells are under-covered, the status is GREEN and the report names the profile `testroom`

#### Scenario: Same room with the default profile
- **WHEN** the same layout is evaluated for a store with profile `market`
- **THEN** the radius is 8 m, 136 of 400 cells are under-covered and the status is YELLOW with `LOW_BEACON_COVERAGE`

#### Scenario: Profile change by a non-admin
- **WHEN** a store manager sends a store update with `readinessProfile: "testroom"`
- **THEN** the request is answered with HTTP 403 and the profile stays unchanged

#### Scenario: Grid missing
- **GIVEN** an active layout without a grid size
- **WHEN** the report is evaluated
- **THEN** `coverageComputed` is false, the report contains `COVERAGE_NOT_COMPUTED` and the page shows "Abdeckung nicht berechnet"
