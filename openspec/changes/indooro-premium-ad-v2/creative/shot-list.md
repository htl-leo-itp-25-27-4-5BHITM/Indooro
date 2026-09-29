# Digital shot and asset build list — future production only

This replaces the earlier filming list. No camera, actor, location or live-action plate is required. Build only after explicit approval. One shared illustrative store layout must drive Remotion route logic and optional Blender shelf placement.

| Asset / storyboard shots | Preferred generator | Deliverable after approval | Remotion-only fallback / acceptance |
|---|---|---|---|
| Modular shelf/floor kit / 01, 07–11 | Blender Python primitives: rounded shelves, matte floor, fixed lights, three virtual cameras | Script + short opaque frame sequences, color/coordinate manifest | SVG shelf planes at 3 depth layers with parallax; one consistent layout, no collision with route |
| Faceless shopper / 01–03, 07–11 | Blender Python parented head/torso/limbs and a few named poses | One reusable adult-proportioned figure, pause/phone/turn/travel/reach keys | SVG silhouette poses and frame-based translation; leg motion restrained, visible at 720p |
| Phone hero body / 03–05, 12 | Blender beveled primitive with subtle reflection, or CSS/SVG from V1 | Transparent still/short pass aligned to screen plane | CSS/SVG shell; no baked UI text |
| Search/result/map screen / 04–06, 12 | Remotion React/SVG from current app/spec reference | Editable UI states with `Milch`, result and route | Same; readable at 720p and clearly illustrative |
| Route and marker / 06–11 | Remotion SVG path plus Blender route mesh where spatial depth matters | Matched screen/store tangent and endpoint at walkable shelf access | SVG path split into foreground/background masks using shelf layers |
| Milk product / 10–11 | Generic Blender carton primitive or SVG shape | Unbranded recognisable target matching UI marker | SVG carton with shelf shadow; no third-party package art |
| Brand card / 12–13 | Remotion vector glyph, approved wordmark, Inter | Fully settled 2.5 s end frame | Same |

Use no photoreal face, detailed hand mesh, cloth simulation, mocap, grocery inventory library or generated live-action clip. Short 3D passes should be reproducible through scripts and deterministic seeds. For Blender, prototype a still and a 1–2 s movement before committing to all passes; if the pass looks toy-like or renders poorly, switch that shot to its listed 2.5D fallback. This is a production *plan*, not an asset creation task executed now.
