# editor-floorplan-underlay Specification

## Purpose
TBD - created by archiving change add-editor-floorplan-underlay. Update Purpose after archive.
## Requirements
### Requirement: Editor shows a calibrated floor plan underlay
The layout editor SHALL let users with layout rights for a store upload a PNG or JPEG floor plan of at most 10 MB as underlay, calibrate its scale from two points and a real distance in meters, adjust opacity, rotation and offset, and lock it. The underlay SHALL be stored per store, SHALL be returned only by protected admin routes with store scope, and SHALL NOT be part of any mobile or public response.

#### Scenario: Tracing shelves
- **GIVEN** a store manager uploads a fire-escape plan photo and marks two wall corners 20.0 m apart
- **WHEN** the underlay is shown at 50 % opacity
- **THEN** grid units align with meters on the plan and newly drawn shelves stay aligned after reload

#### Scenario: Wrong file type
- **WHEN** a user uploads a 12 MB file or an SVG
- **THEN** the upload is rejected with a German message and nothing is stored

#### Scenario: Mobile API
- **WHEN** `GET /api/mobile/stores/{id}/layout/current` is called
- **THEN** the response contains no underlay data

