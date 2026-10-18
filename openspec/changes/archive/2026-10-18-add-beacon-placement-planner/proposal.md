## Why

Before buying and mounting beacons in a store, the team needs to know how many beacons a pilot area needs and where they should go. The iOS solver needs at least three fresh beacon distances (`StabilizedNavigationConfig.swift:17`, distance range 0.35–11 m), and the pilot plan estimates one beacon per 6–8 m (`docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md` 3.2) without any tool support. Placement is a geometry problem that can be solved offline from the layout JSON, and its result feeds the store beacon plan for the operator and the readiness check.

## What Changes

- Add a cross-platform Python tool `scripts/beacon-planner/` that reads a layout JSON, derives walkable cells, proposes mounting positions on shelf tops and walls, and selects a minimal set of beacons so that a target share of walkable cells has at least three beacons within a configurable radius and a geometry indicator below a threshold.
- Output: `beacons-plan.csv` (compatible with the configuration record of `establish-pilot-field-measurement`), an SVG coverage map, and a layout patch with beacon elements (placeholder identities, minors numbered).
- Validate the tool on the test-room layout and the demo supermarket layout; compare its output to the 8 × 8 m grid used in the synthetic tests.

## Capabilities

### New Capabilities

- `beacon-placement-planning`: offline beacon placement proposal and coverage report from a layout.

### Modified Capabilities

- None.

## Impact

- Owner: Person C „Feld, Daten & Pilot-Kit“ (Windows), branch `pilot/beacon-planner` from `pilot/first-store`.
- Files: `scripts/beacon-planner/**` (new), `docs/pilot-readiness/hardware/PLANNER.md` (new).
- No app, backend or admin change. The radius model is a planning aid, not a measurement; field measurements decide.
