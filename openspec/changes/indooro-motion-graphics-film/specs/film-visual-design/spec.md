## ADDED Requirements

### Requirement: The film has one coherent visual system
The film SHALL use the documented dark palette, off-white hierarchy, mint active state, consistent spacing, and the same typography system in all eight scenes. Verification: inspect representative frames and compare pixel colors and typography against `creative-direction.md`.

#### Scenario: Scene changes from phone to map
- **WHEN** the phone search shot expands into the map shot
- **THEN** the same mint route accent and off-white text hierarchy remain identifiable without an unrelated visual reset

### Requirement: Text remains readable at review size
Primary on-screen claims SHALL be readable at 960×540 review size, and secondary labels SHALL not overlap scene subjects. Verification: inspect the preview frames at native preview resolution.

#### Scenario: Feature headline is visible
- **WHEN** a representative frame from each feature scene is viewed at 960×540
- **THEN** the headline is legible and the main visual remains unobstructed

### Requirement: Product concept is labeled
Detailed app and administration UI shots SHALL carry a subtle `Konzeptdarstellung` label. Verification: review scene 3 and 7 stills.

#### Scenario: Search screen appears
- **WHEN** the illustrative mobile search UI is shown
- **THEN** the concept label is visible and no authentic screen-capture claim is made
