## Why

The shared coverage rule (8 m radius, at least 3 beacons, at most 5 % weak area; `readiness/coverage-rule.json`) fits a market with shelves. For an empty 20×20 m test room with nine beacons it always reports YELLOW: at 8 m, 136 of 400 cells (34 %) have fewer than three beacons. `docs/pilot-readiness/team/STATUS.md` lists this as the open decision "Entscheidung Abdeckungsregel". The test room `SPAR-Leonding-002` therefore can never be GREEN, and the report cannot tell a useful gap from a rule that does not fit the room.

## What Changes

- `coverage-rule.json` keeps its top-level values as profile `market` (default, unchanged) and gains a `profiles` object. A profile overrides only the fields it names. `testroom` is proposed with radius 10 m (line of sight, no shelves); minimum beacons (3) and allowed share (5 %) are inherited. At 10 m the nine-beacon room has 8 of 400 weak cells (2 %).
- Each store has a `readinessProfile` (column `stores.readiness_profile`, default `market`, Flyway V19, additive). It is part of the store detail response and the store upsert request; only role `admin` may change it, an unknown id is a 400, `null` keeps the current value.
- `GET /api/stores/{id}/readiness` evaluates with the store's profile. Without a `radius` parameter the profile's radius applies. The report names `profile`, `coverageComputed`, `minBeaconsPerCell` and `maxLowCoverageShare`.
- Honesty: coverage that was not calculated is never reported as a result. `coverageComputed` is false without an active layout or when the grid is missing or too large; the latter adds the warning `COVERAGE_NOT_COMPUTED`. The admin page then shows "Abdeckung nicht berechnet" and not "Keine begehbaren Zellen". A profile never skips the calculation; the computed share is always shown next to the rule.
- Admin UI: the readiness page shows the profile, the rule and the computed share; the Markdown export lists them. The store detail page shows the profile and lets an admin change it.

## Impact

- Affected: `backend/indooro_server/.../admin/readiness/`, `StoreEntity`, `StoreDtos`, `StoreAdminService`, `StoreReadinessResource`, migration `V19__store_readiness_profile.sql`, `admin-ui` (readiness page, store detail page), shared API contract, spec `store-layout-management`.
- The beacon planner (`scripts/beacon-planner`) and the editor coverage overlay keep reading only the top-level `market` rule.
- The `testroom` radius is a proposal; the team still decides the final values (US-31).
- Migration V19 must be applied by the next backend rollout (additive column with a default).
