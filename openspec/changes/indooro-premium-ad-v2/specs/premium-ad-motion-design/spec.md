## ADDED Requirements

### Requirement: Action-motivated transitions
The film SHALL connect shopper, phone, map and generated store shots with planned screen direction, shared store geometry and continuous route motion; transitions SHALL serve the action rather than fill time.

#### Scenario: Continuous phone-to-world passage
- **WHEN** the customer selects a product on the phone
- **THEN** one continuous camera progression carries the route through the phone screen as map footprints become store shelves, with no blur-hidden camera reset and a geometry-matched 2.5D fallback

### Requirement: Three distinct signature moments
The film SHALL make the opening clarity shift, the phone-to-world passage and the destination-to-brand resolution identifiable visual events with documented camera, frame, sound, compositing, failure and fallback plans. The route SHALL retain one consistent draw, corner, marker and destination behavior across UI and store space.

#### Scenario: Signature-shot review
- **WHEN** the four draft prototype sequences are reviewed at normal speed
- **THEN** each of the three signature ideas is understood without explanatory text, and the route remains visually continuous from phone to product to brand

### Requirement: Deterministic timing
The future Remotion composition and any Blender passes SHALL use deterministic frame-based animation and a shot-level timing map, and the final timeline SHALL have no accidental gaps, duplicate frames or unsynchronized cue boundaries.

#### Scenario: Repeated frame and boundary checks
- **WHEN** representative frames and cut boundaries are rendered twice from the same source/assets
- **THEN** matching frame hashes and coherent adjacent images are observed
