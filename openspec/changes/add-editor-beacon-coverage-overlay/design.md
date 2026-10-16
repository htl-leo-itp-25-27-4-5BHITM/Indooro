## Decisions

1. Pure module `editor/coverage.ts`; shared JSON test vectors exported by the Python tool (`scripts/beacon-planner/fixtures/vectors.json`).
2. Overlay computed in a Web Worker if > 5,000 walkable cells; otherwise inline.
3. Overlay is view-only and never saved into the layout.
