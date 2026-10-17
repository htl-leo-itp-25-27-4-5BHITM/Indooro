# beacon-placement-planning Specification

## Purpose
TBD - created by archiving change add-editor-beacon-coverage-overlay. Update Purpose after archive.
## Requirements
### Requirement: Editor shows beacon coverage while editing
The layout editor SHALL offer an overlay that colors walkable cells by the number of placed beacons within a configurable radius (default 8 m) and SHALL show the share of walkable area with at least three beacons; the computation SHALL produce the same counts as the Python planner for shared test vectors, and the overlay SHALL NOT be stored in the layout.

#### Scenario: Moving a beacon
- **GIVEN** the coverage overlay is on and 88 % of the area has ≥ 3 beacons
- **WHEN** a beacon is moved closer to an uncovered aisle
- **THEN** the overlay and the percentage update without saving

