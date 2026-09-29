## ADDED Requirements

### Requirement: Isolated and reproducible V2 project
The future implementation SHALL live under `indooro-ad-v2/`, keep V1 source/assets intact, pin compatible dependencies, and document asset provenance and commands.

#### Scenario: Clean checkout production
- **WHEN** an authorized producer prepares the project from a clean checkout plus documented licensed media
- **THEN** the composition and preview can be built without undocumented imports from V1 or a running Indooro backend

### Requirement: Preview-first workflow
The future production SHALL begin with short key-shot prototypes and 1280×720 H.264 review renders before a complete final-quality master.

#### Scenario: Initial approved implementation phase
- **WHEN** V2 production receives explicit approval
- **THEN** hook, human/phone, route and end-card prototypes are reviewed before full scene build and final render
