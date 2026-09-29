## ADDED Requirements

### Requirement: Isolated and reproducible V2 project
The future implementation SHALL live under `indooro-ad-v2/`, keep V1 source/assets intact, pin compatible dependencies, and document source/provenance and commands for all programmatic assets and any Blender passes. It SHALL render without photographed footage, an external video-generation service or Cinema 4D.

#### Scenario: Clean checkout production
- **WHEN** an authorized producer prepares the project from a clean checkout plus documented voice/music assets
- **THEN** the composition and preview can be built without undocumented imports from V1, a running Indooro backend or any filmed footage

### Requirement: Optional 3D pipeline with fallback
Remotion SHALL own the master edit, UI, typography, route handoff and audio. Blender MAY generate short scripted 3D store, shopper or phone passes, but equivalent Remotion 2.5D shots SHALL preserve the complete story if Blender is unavailable.

#### Scenario: Blender preflight fails
- **WHEN** Blender cannot be installed or scripted reliably after production approval
- **THEN** the approved storyboard remains executable through the documented Remotion/SVG/2.5D fallback without changing the central claim or shopper journey

### Requirement: Preview-first workflow
The future production SHALL begin with short key-shot prototypes and 1280×720 H.264 review renders before a complete final-quality master.

#### Scenario: Initial approved implementation phase
- **WHEN** V2 production receives explicit approval
- **THEN** generated shopper/store, phone, route handoff and end-card prototypes are reviewed before full scene build and final render
