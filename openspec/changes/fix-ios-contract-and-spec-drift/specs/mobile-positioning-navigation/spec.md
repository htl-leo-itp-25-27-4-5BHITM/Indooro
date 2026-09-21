## MODIFIED Requirements

### Requirement: Walkable graph is derived from the layout grid
WHEN a layout is applied, the iOS app SHALL build a one-meter grid graph over `gridWidth × gridHeight`, SHALL block every cell whose center lies inside, or whose area is crossed by the edges of, the footprint of every element except `beacon` and `entrance`, where the footprint is the rectangle `x, y, max(width, 1), max(height, 1)` rotated by `rotation` degrees around its center, SHALL create a node at each free cell center, SHALL connect horizontally and vertically adjacent free nodes with cost 1, and SHALL find routes with A* using Euclidean distance between the nearest nodes to start and destination, prefixing the polyline with the start point and suffixing it with the destination.

#### Scenario: Destination is inside a shelf
- **GIVEN** the destination is a shelf center whose cells are blocked
- **WHEN** a route is requested
- **THEN** the route ends at the nearest free node and the polyline's last point is the shelf center

#### Scenario: No path exists
- **GIVEN** start and destination are in disconnected free areas
- **WHEN** a route is requested
- **THEN** no route is published and the route line is cleared

#### Scenario: Shelf rotated by 90 degrees
- **GIVEN** a 4 m × 1 m shelf at x=2, y=2 with `rotation: 90`
- **WHEN** the graph is built
- **THEN** the blocked cells form a vertical 1 × 4 strip centered at 4 m / 2.5 m instead of a horizontal strip

## ADDED Requirements

### Requirement: Applied layouts are cached per store
WHEN a store layout or the default layout is applied from the server, the iOS app SHALL persist the layout response as JSON in `Application Support/LayoutCache/<storeId>.json` or `default.json`, excluded from device backup, together with the time it was saved. WHEN a later server request for the same store or the default layout fails, the app SHALL apply the cached copy before falling back to history or the bundled layout and SHALL describe it as „<store> • Offline-Kopie vom <Datum>“.

#### Scenario: Store opened offline
- **GIVEN** the layout of store S was applied yesterday
- **WHEN** store S is selected while offline
- **THEN** yesterday's layout is shown with „Offline-Kopie vom <Datum>“

#### Scenario: No cached copy exists
- **GIVEN** store T was never loaded
- **WHEN** store T is selected while offline
- **THEN** the store-layout failure behavior applies
