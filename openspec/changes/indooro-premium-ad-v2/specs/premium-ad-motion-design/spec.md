## ADDED Requirements

### Requirement: Action-motivated transitions
The film SHALL connect its key physical and digital shots with planned screen direction, matched geometry or continuous route motion; transitions SHALL serve the action rather than fill time.

#### Scenario: Phone-to-route match cut
- **WHEN** the customer selects a product on the phone
- **THEN** the destination/route graphic carries its direction into the next spatial shot without an arbitrary visual reset

### Requirement: Deterministic timing
The future Remotion composition SHALL use frame-based animation and a shot-level timing map, and the final timeline SHALL have no accidental gaps, duplicate frames or unsynchronized cue boundaries.

#### Scenario: Repeated frame and boundary checks
- **WHEN** representative frames and cut boundaries are rendered twice from the same source/assets
- **THEN** matching frame hashes and coherent adjacent images are observed
