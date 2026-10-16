## 1. Gate and Setup

- [ ] 1.1 Confirm ≥ 5 real recordings with truth markers from two sites exist; otherwise stop and record „wartet auf Messungen“.
- [ ] 1.2 Branch `pilot/motion-positioning`; validate the change.

## 2. Recording

- [ ] 2.1 Ensure the recorder writes step and heading events; replay ignores unknown events gracefully; tests.
- [ ] 2.2 Ask Person C for two new walks with motion data per site.

## 3. Model

- [ ] 3.1 Standing detection and BLE damping behind flag `motionAided`.
- [ ] 3.2 Step displacement along the walkable graph; tests with synthetic walks.
- [ ] 3.3 BLE/step consistency check (large BLE jump without steps → hold).

## 4. Evidence

- [ ] 4.1 Replay all real recordings with flag on/off; table in `BASELINE.md`.
- [ ] 4.2 Decide per design decision 3; enable or keep off; document.
- [ ] 4.3 PR → `pilot/first-store`; `STATUS.md`.
