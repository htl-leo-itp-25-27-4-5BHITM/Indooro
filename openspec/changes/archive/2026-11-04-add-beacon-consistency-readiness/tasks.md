## 1. Backend

- [x] 1.1 Extend `ReadinessDtos.AssignedBeacon` with uuid, major, minor (3-argument constructor derives them from the identity key); `StoreReadinessService` passes the `beacons` table values.
- [x] 1.2 Add `checkBeaconConsistency` to `StoreReadinessEvaluator` for all-zero UUID, missing major/minor, duplicate identity (registry and layout), identity mismatch and layout beacon not registered.
- [x] 1.3 Add evaluator tests for each finding, the 2026-10-19 mismatch case, case/dash insensitive matching and no finding for matching data.

## 2. Admin

- [x] 2.1 Add `BEACON_CONSISTENCY_CODES`, `beaconConsistencyFindings` and `beaconConsistencyText` to `admin-ui/src/readiness.ts`; list the state in the Markdown export.
- [x] 2.2 Show the "Beacon-Registrierung" line and a "Beacons verwalten" link for registry findings in `ReadinessPage.tsx`.
- [x] 2.3 Add unit tests (`readiness.test.ts`) and Playwright tests (`readiness.spec.ts`).

## 3. Verification

- [x] 3.1 `./mvnw test`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:browser -- tests/browser/readiness.spec.ts`, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
