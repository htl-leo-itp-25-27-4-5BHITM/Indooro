## Why

The beacon placement planner (`add-beacon-placement-planner`) runs as a Python script. Whoever edits a store layout in the admin should see immediately where beacon coverage is too weak, while moving beacons. Porting the coverage computation to the editor makes this visible without leaving the browser.

## What Changes

- Port the planner's walkable grid, coverage count and HDOP computation to TypeScript (same test vectors as the Python tool).
- Editor overlay toggle „Beacon-Abdeckung“: colors walkable cells by beacons in range (0–2 red, 3 yellow, ≥ 4 green) with radius control; summary „<n> % der Fläche mit ≥ 3 Beacons“.
- Optional „Vorschlag übernehmen“: import `beacons-plan.csv` from the Python tool as beacon elements with placeholder identities.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `beacon-placement-planning`: coverage overlay in the admin editor.

## Impact

- Owner: Person C (Windows). Branch `pilot/editor-coverage` from `main` after the admin rebuild merge and after `add-beacon-placement-planner` is merged.
- Admin UI editor only (`admin-ui/src/editor/`), tests. No backend change.
