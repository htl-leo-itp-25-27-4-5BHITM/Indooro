## Why

On 2026-10-19 the beacon registry of `SPAR-Leonding-002` was inconsistent and nothing flagged it. The admin beacon `Indooro5` had UUID `00000000000000000000000000000000` while the layout held beacon `…1c17` at that spot, and beacon `…1c15` had no major/minor. `GET /api/mobile/stores/beacon-identities` reads the `beacons` table, not the layout elements, so the app never saw the layout beacons. The readiness report only compared beacons by id or code and checked "assigned but not placed".

## What Changes

- The store readiness report (`StoreReadinessEvaluator`) adds blocking findings: `BEACON_UUID_ALL_ZERO`, `BEACON_MAJOR_MINOR_MISSING`, `BEACON_IDENTITY_DUPLICATE`, `BEACON_IDENTITY_MISMATCH` (layout element linked to a registered beacon with another identity) and `LAYOUT_BEACON_NOT_REGISTERED`. Identity is compared as uuid + major + minor, case and dash insensitive. The existing `BEACON_ASSIGNED_NOT_PLACED` warning covers a registered beacon that is missing in the layout.
- `AssignedBeacon` carries uuid, major and minor from the `beacons` table.
- The admin readiness page shows a "Beacon-Registrierung" line (deviation count, or "Keine Beacons zum Vergleichen" when there is nothing to compare), links registry findings to the beacon admin, and the Markdown export lists the state.

## Impact

- Affected: `backend/indooro_server/.../admin/readiness/`, `admin-ui/src/ReadinessPage.tsx`, `admin-ui/src/readiness.ts`, spec `store-layout-management`.
- No database migration, no API shape change (findings are existing records), no iOS change.
- A store whose layout beacons are not registered now reports RED instead of YELLOW or GREEN. That is intended.
