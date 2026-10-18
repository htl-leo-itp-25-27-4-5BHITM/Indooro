## Why

Customers must tap „Erledigt“ for each stop. The navigation review suggested an optional prompt („Bist du bei Regal X?“) when the customer stays near the active shelf (`docs/NAVIGATION_REVIEW.md` F, „Ankunft“). Done automatically it would be wrong too often with BLE accuracy; as a suggestion it saves taps when positioning is good. Radius and dwell time must come from field data.

## What Changes

- Show a non-blocking suggestion „Bist du bei <Regal>? – Ja, erledigt / Noch nicht“ when a trusted position stays within radius R of the active stop for T seconds; never complete automatically.
- R and T configurable, defaults from the field measurement results (`docs/pilot-readiness/hardware/RESULT_SUMMARY.md`); disabled when positioning mode is „Ohne Ortung“ or the position is not trusted.
- Counters for the study mode: suggestions shown, accepted, rejected.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `mobile-shopping-lists`: optional arrival suggestion for the active stop.

## Impact

- Owner: Person A (Mac). Branch `pilot/arrival-suggestion`. Gate: `RESULT_SUMMARY.md` exists with measured error; navigation session hooks requested from Erik (read-only position/trust and active stop).
