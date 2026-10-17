## Decisions

1. **Inputs**: `CMPedometer` step events (or step detection from `CMDeviceMotion` acceleration), heading from `CMDeviceMotion` attitude; both recorded with timestamps.
2. **Model**: per tick, if no step for ≥ 1.5 s → standing → BLE update weight × 0.2 (provisional); while walking → predicted displacement = steps × step length (0.7 m provisional, calibratable per person) along the walkable edge closest to heading; BLE correction blends towards the measurement.
3. **Evidence gate**: flag off by default; turned on only if, on all real recordings, lagP95 and standing path length improve by ≥ 20 % and reroutes per tour do not increase.
4. **No new UI**.

## Gate adjustment (2026-10-17)

Erik decided on 2026-10-17 to pull groups 2 and 3 forward and to build them **before** the field measurements, behind the flag `motionAided` (default off). Reason: Person C records real beacon walks soon; a recording without step and heading data cannot be used for this change later. Only group 4 (replay evaluation with real recordings and the decision to enable the flag) waits for the original gate (≥ 5 real recordings with truth markers from two sites). Decision 3 (evidence gate) is unchanged.

Consequences:

- **Flag off is the contract.** With `motionAided == false` nothing in the pipeline reads step or heading data. Replays of every existing recording and every synthetic fixture produce metrics identical to the state before this change (`REPLAY` lines unchanged, compared by `ReplayMetrics ==` in tests).
- **Every new parameter is provisional.** No value below comes from a recording. The values are placeholders so that the model is testable on synthetic walks; calibration happens only in group 4.
- **Live sensor feed is not wired into `BeaconManager`.** The pipeline API (`recordStep`, `recordHeading`) is ready and tested on replays. Feeding live CoreMotion data into the pipeline belongs to group 4, after the evidence says the flag is worth enabling. Until then the sensors run only in the DEBUG recorder.

## Implementation notes

### Recording (2.1)

- New JSON Lines types `step` and `heading` (additive; old files stay valid, old readers that skip unknown types stay valid):
  - `step`: `t`, `steps` (cumulative since recording start, `CMPedometer.numberOfSteps`), `distance` (meters, optional, `CMPedometer.distance`), `source` (`pedometer`).
  - `heading`: `t`, `degrees` (compass bearing 0–360, true north when available, else magnetic), `accuracy` (degrees, ≥ 0), `source` (`compass`). Written from `CLHeading` (already delivered to `BeaconManager` for the display heading; no second sensor session).
- `NavigationRecordLine.parse` skips lines with an unknown `type` instead of throwing, so recordings from newer builds stay readable. A line that is not valid JSON, or that has a known `type` and broken fields, still throws.
- `NavigationReplay` ignores `step` and `heading` lines when the flag is off. They are removed before the replay timeline is built, so they cannot shift the tick grid or the duration.
- The permission „Bewegung & Fitness“ is requested only by the DEBUG recorder (`CMPedometer.startUpdates` triggers the system dialog) and only while recording is on. `NSMotionUsageDescription` already exists in the build settings of the app target (Debug and Release, owned by Person A), so nothing changes in `Info.plist` or `project.pbxproj`. If the permission is denied or `CMPedometer.isStepCountingAvailable()` is false, the recorder writes no `step` lines and continues with BLE-only data; recording never fails because of motion.

### Model (3.1–3.3), all provisional, flag `motionAided` (default off)

`MotionConfig` in `StabilizedNavigationConfig` (`motionAided = false`):

| Parameter | Value | Reason |
|---|---|---|
| `standingAfterSeconds` | 1.5 s | Decision 2. One step takes ≈ 0.5 s; three missed steps mean standing. |
| `standingAlphaFactor` | 0.2 | Decision 2. Multiplies the estimator alpha while standing, so BLE noise moves the estimate 5× less. |
| `stepLengthMeters` | 0.7 m | Decision 2. Typical adult step; calibratable per person later. |
| `headingToleranceRadians` | 60° | A heading further than 60° from every outgoing walkable edge direction gives no displacement; BLE alone decides. |
| `standingJumpConfirmations` | 12 | While standing, a BLE jump (outside the existing gate) needs 12 consistent ticks (≈ 4.2 s at 0.35 s) instead of `jumpConfirmations` (3). Holds, but cannot dead-lock if the person really was moved (cart, pedometer outage). |

Behavior per tick, in this order, only when `motionAided` and motion data is present:

1. **Standing detection (3.1).** Standing = the pedometer step count has not increased for `standingAfterSeconds`. Without any step data (denied permission, old recording) the state is *unknown* and the pipeline behaves exactly as with the flag off.
2. **Step displacement (3.2).** New steps since the last tick × `stepLengthMeters` move the estimate along the outgoing edge of the nearest graph node whose direction is closest to the latest heading (map convention of `BeaconManager.mapHeadingRadians`: 0 rad = +y, `bearing → π − bearing`). The displaced estimate is the prior; the BLE point then corrects it through the normal gate and EMA. The projector keeps the result on the walkable graph.
3. **BLE damping while standing (3.1).** The EMA alpha is multiplied by `standingAlphaFactor`.
4. **Consistency check (3.3).** While standing, a BLE jump outside the gate needs `standingJumpConfirmations` instead of `jumpConfirmations`.

Not part of this change: automatic arrival, route changes from motion data, any UI.
