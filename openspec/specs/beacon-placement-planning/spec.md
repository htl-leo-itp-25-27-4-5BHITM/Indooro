# beacon-placement-planning Specification

## Purpose
Defines how the admin editor shows beacon coverage and supports planning beacon placement.
## Requirements
### Requirement: Editor shows beacon coverage while editing
The layout editor SHALL offer an overlay that colors walkable cells by the number of placed beacons within a configurable radius (default 8 m) and SHALL show the share of walkable area with at least three beacons; the computation SHALL produce the same counts as the Python planner for shared test vectors, and the overlay SHALL NOT be stored in the layout.

#### Scenario: Moving a beacon
- **GIVEN** the coverage overlay is on and 88 % of the area has ≥ 3 beacons
- **WHEN** a beacon is moved closer to an uncovered aisle
- **THEN** the overlay and the percentage update without saving

### Requirement: Planner proposes beacon positions from a layout
The beacon planner SHALL read a layout JSON with 1 unit = 1 meter, SHALL derive walkable cells with the same blocking rule as the iOS walkable graph including rotated elements, SHALL propose mounting candidates on shelves and walls, and SHALL select a deterministic set of beacons so that at least the target share of walkable cells (default 95 %) has at least `k` (default 3) beacons within radius `R` (default 8 m) and an HDOP below the threshold (default 2.5), or SHALL report that the target cannot be reached with the maximum count. The same input and parameters SHALL always produce the same output.

#### Scenario: Demo supermarket
- **GIVEN** the demo supermarket layout (40 × 60 units)
- **WHEN** the planner runs with default parameters
- **THEN** it writes a plan, the share of covered walkable cells is at least 95 %, and the number of beacons is reported

#### Scenario: Unreachable target
- **GIVEN** a maximum of 4 beacons for a 40 × 60 layout
- **WHEN** the planner runs
- **THEN** it exits with a non-zero code and reports the achieved coverage share

#### Scenario: Determinism
- **WHEN** the planner runs twice with identical input
- **THEN** both `beacons-plan.csv` files are byte-identical

### Requirement: Planner outputs are usable for mounting and records
The planner SHALL write `beacons-plan.csv` with columns `minor,x_m,y_m,mount,notes`, an SVG coverage map that shows walkable cells colored by the number of beacons in range and numbered beacons, and a copy of the layout with beacon elements carrying a placeholder UUID and sequential minors, without modifying the input file.

#### Scenario: Outputs for the store contact
- **WHEN** a plan is created for the pilot area
- **THEN** the SVG can be opened in a browser and the CSV can be imported into the configuration record of the site

