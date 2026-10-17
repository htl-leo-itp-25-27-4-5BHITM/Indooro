## 1. Gate and Setup

- [x] 1.1 Gate adjusted (decision Erik, 2026-10-17): groups 2 and 3 are built before the field measurements, behind flag `motionAided` (default off, behavior with the flag off is bit-identical). Only group 4 (evaluation with real recordings and the decision to enable) waits for ≥ 5 real recordings with truth markers from two sites; until then record „wartet auf Messungen“ in `STATUS.md`. Reason: Person C records real beacon walks soon, and recordings without step and heading data would be useless for this change.
- [x] 1.2 Branch `pilot/motion-positioning`; validate the change.

## 2. Recording

- [x] 2.1 Ensure the recorder writes step and heading events; replay ignores unknown events gracefully; tests.
- [x] 2.2 Ask Person C for two new walks with motion data per site (announced in `STATUS.md`; the walks themselves are a human step).

## 3. Model

- [x] 3.1 Standing detection and BLE damping behind flag `motionAided`.
- [x] 3.2 Step displacement along the walkable graph; tests with synthetic walks.
- [x] 3.3 BLE/step consistency check (large BLE jump without steps → hold).

## 4. Evidence

- [ ] 4.1 Replay all real recordings with flag on/off; table in `BASELINE.md`.
- [ ] 4.2 Decide per design decision 3; enable or keep off; document.
- [ ] 4.3 PR → `pilot/first-store`; `STATUS.md`.
