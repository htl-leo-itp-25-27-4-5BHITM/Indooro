## Why

The stabilized estimator removed the old 20 Hz prediction because it amplified noise (`docs/NAVIGATION_REVIEW.md` C.3). Real recordings from `establish-pilot-field-measurement` will show how much error and lag remain. Pedestrian dead reckoning (step detection plus heading from CoreMotion) is the standard way to make a BLE position follow a walking person smoothly and to keep it still while standing. It is only worth building once recordings exist to prove a benefit.

## What Changes

- Record step events and device heading in the DEBUG recorder (if not already present) so replays contain motion data.
- Add a motion model to the position estimator: standing detection (no steps → strongly damp BLE updates), step-based displacement along the walkable graph between BLE fixes, and a consistency check between BLE jumps and steps.
- Enable it behind a configuration flag; compare replay metrics against the current estimator on all real recordings; ship only if lag and jitter improve without more wrong reroutes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `mobile-positioning-navigation`: optional motion-aided estimation with evidence gate.

## Impact

- Owner: Erik (Mac). Branch `pilot/motion-positioning`. Gate: at least five real recordings with truth markers from two sites exist (`establish-pilot-field-measurement` section 5).
- iOS: `Utilities/PositioningPipeline.swift`, `PoseFusionService.swift`, `NavigationRecorder.swift`, `NavigationReplay.swift`, `BeaconManager.swift` (CoreMotion wiring), tests.
