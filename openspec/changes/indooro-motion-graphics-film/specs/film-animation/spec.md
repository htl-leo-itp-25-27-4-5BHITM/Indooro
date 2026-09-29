## ADDED Requirements

### Requirement: Animation is deterministic and frame-based
All significant motion SHALL derive from the current frame or deterministic data. Verification: render the same sampled frame twice and compare image hashes.

#### Scenario: A frame is rendered twice
- **WHEN** frame 810 is rendered in separate runs
- **THEN** the image output is identical under the same source and dependencies

### Requirement: Routes respect walkable geometry
The A* visualization SHALL use a path calculated from explicit walkable grid cells and SHALL not visibly pass through shelves. Verification: route unit test plus map still review.

#### Scenario: Destination is behind a shelf
- **WHEN** the path to the milk access node is drawn
- **THEN** it follows corridors and terminates at a walkable access point

### Requirement: Transitions preserve continuity
Every scene boundary SHALL use a shared motif or coordinated camera/opacity move with no black gap or unintentional jump. Verification: inspect frames immediately before, at, and after all seven boundaries.

#### Scenario: Route scene transitions to list scene
- **WHEN** frame 1290 is crossed
- **THEN** the route line remains a meaningful visual anchor as list destinations are introduced
