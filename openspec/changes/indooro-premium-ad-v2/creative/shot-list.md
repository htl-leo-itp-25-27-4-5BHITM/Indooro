# Digital shot and asset list — future production only

Nine storyboard shots, 26 s / 780 frames. This list is a plan; build nothing until explicit prototype approval. The four first prototypes are **P1 opening (shots 01–02), P2 smartphone/search (shot 03), P3 phone-to-store (shot 04), P4 destination/brand (shots 08–09)**. Navigation shots 05–07 belong to later full production after prototype approval. All assets use one illustrative walkable store layout.

| Asset / shots | Preferred scripted asset | Blender responsibility | Remotion responsibility / fallback |
|---|---|---|---|
| Modular store and camera / 01–02, 04–08 | Shelf/floor kit, camera splines, fixed light rigs, ID/depth masks | Render short 720p draft beauty/depth/ID passes, later selected final passes | Composite and grade; layered shelf cards/parallax for every shot |
| Sculptural shopper / 01–03, 06–08 | Adult jacket-like continuous silhouette; named pause, phone, turn, reach poses | Model with simple mesh/bevel/materials, parented controls, short translations/poses; no face or full gait rig | Preserve human framing/continuity; 2.5D silhouette, upper-body or partial interaction fallback |
| Hero phone / 02–04 | Beveled body, screen plane/matte and projection data | Render body, reflections, screen occlusion and camera motion | Editable `Milch` search/result/map UI; corner-pin screen composite or CSS 3D body fallback |
| Shared route/map / 03–09 | One polyline, UI/floor transform, marker and endpoint | Map footprints extrude to shelves in shot 04; floor mesh/depth for 04–08 | SVG core, draw timing, overlap, position ripple, marker, grade, route-to-brand; perspective/occlusion-mask fallback |
| Milk destination / 08 | Generic warm-white carton, sparse neighboring product silhouettes, exact shelf access | Render shelf/carton, reach pose and light/depth passes | Destination circle/plane, contrast hierarchy, contact cue; 2.5D shelf/product/partial-shopper fallback |
| Approved brand / 09 | Official mark/wordmark and one claim | Optional dissolving store silhouettes only | Residual route creates or frames mark, `INDOORO`, `Finde deinen Weg.` held frames 705–779 |

Keep fixed seeds, color space and coordinate manifest. Draft prototypes use 1280×720, 30 fps, low samples/fast settings, temporary cleared audio and scratch VO only where useful. Review each in motion, not only stills. No photographed actor, location, stock footage, photoreal face, cloth simulation, mocap or C4D is required. Main/fallback, failure points and precise sound timing for the three signature moments are in [signature-shots.md](signature-shots.md).
