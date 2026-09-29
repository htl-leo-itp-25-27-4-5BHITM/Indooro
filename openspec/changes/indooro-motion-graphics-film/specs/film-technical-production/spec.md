## ADDED Requirements

### Requirement: Source is reproducible and isolated
The video SHALL be an editable standalone Remotion TypeScript project under `indooro-motion/` with pinned dependencies, local assets, and documented commands. Verification: clean install, typecheck, and sample render.

#### Scenario: Another developer opens the project
- **WHEN** dependencies are installed according to the README
- **THEN** the main composition can be previewed and rendered without running the Indooro app or backend

### Requirement: Main export meets delivery format
The final MP4 SHALL be 1920×1080, 30 fps, 1950 frames/65 seconds, H.264, yuv420p, and AAC if audio is included. Verification: media probe of the actual delivered file.

#### Scenario: Final file is probed
- **WHEN** media metadata is inspected
- **THEN** codec, pixel format, dimensions, frame rate, duration, and audio stream match the render plan

### Requirement: Companion files are delivered
The project SHALL include a smaller preview MP4, representative poster PNG, final storyboard, production report, and editable source. Verification: file existence, nonzero sizes, and opening each media file.

#### Scenario: Delivery directory is checked
- **WHEN** exports are enumerated
- **THEN** all required deliverables exist with the requested filenames
