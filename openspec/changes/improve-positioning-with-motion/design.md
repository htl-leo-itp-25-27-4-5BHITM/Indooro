## Decisions

1. **Inputs**: `CMPedometer` step events (or step detection from `CMDeviceMotion` acceleration), heading from `CMDeviceMotion` attitude; both recorded with timestamps.
2. **Model**: per tick, if no step for ≥ 1.5 s → standing → BLE update weight × 0.2 (provisional); while walking → predicted displacement = steps × step length (0.7 m provisional, calibratable per person) along the walkable edge closest to heading; BLE correction blends towards the measurement.
3. **Evidence gate**: flag off by default; turned on only if, on all real recordings, lagP95 and standing path length improve by ≥ 20 % and reroutes per tour do not increase.
4. **No new UI**.
