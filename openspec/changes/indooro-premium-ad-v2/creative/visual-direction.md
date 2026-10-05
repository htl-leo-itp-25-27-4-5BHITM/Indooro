# Final visual direction and Indooro motion language

## World and human

Keep V1 anchors: graphite `#071117`, panel `#11242B`, off-white `#F4F7F5`, mint `#63E6B4`; amber `#E8B86D` appears only before Indooro activation. The store is premium architectural geometry: repeated beveled shelf masses, sparse product silhouettes, matte floor, cool edge lights and controlled depth. It feels large through scale, perspective and occlusion, never a cartoon maze or photoreal grocery inventory. Indooro changes **attention**, not architecture: no shelf movement. At activation, peripheral light/detail recede, the nearby path and destination sector retain definition, and mint enters.

The shopper has adult proportions around 7–7.5 head heights, a clean readable silhouette, a continuous jacket/coat-like torso volume, understated trouser and shoe shapes, and one subtle collar/seam cue. Form is sculptural, with soft graphite fabric and ceramic-like matte surfaces plus restrained rim light. Avoid visible spheres/cylinders, block joints, eyes, mouth, hair simulation, skin realism, low-poly facets and mascot proportions. A simple procedural Blender mesh can use bevel/subdivision, parented rigid parts hidden under clothing volumes, four named poses (pause, phone lift, turn, reach) and short body translations. Legs need only a few credible weight shifts; long walking cycles are not the selling point. Frame the human at wide/medium scale; no face close-up. If the full figure looks synthetic, crop to upper body/shoulder, a well-shaped silhouette and an abstract hand/device interaction while keeping the figure present in the opening, route and find.

The phone is a premium dark slab with a simple bevel and controlled reflection. Render body/occlusion in Blender where useful; render screen text and UI in Remotion at native sharpness. `Milch`, one result and the map are the only functional states. Include appropriate illustrative-UI disclosure and verify copy against app specs. The milk carton is a warm off-white generic shape, with no real retailer or packaging art. Inter remains the proposed UI and claim typeface. Final approved mark and wordmark are still to be supplied/selected.

## Route as one designed object

These are **design targets**, to verify in the first 720p prototypes, rather than claims about a finished render:

| Behavior | 2D UI/map | 3D store / destination / brand |
|---|---|---|
| Color/core | `#63E6B4` core; do not rely on glow for legibility | Same core, slightly desaturated by scene lighting but color matched in composite |
| Thickness | 8 px at 1080p, 5.3 px at 720p; round caps | ~0.055 m raised floor ribbon/tube, camera-tested to read like the same 8 px core in hero perspectives |
| Glow | Soft bloom halo about 2–2.5× core width, ≤25% core opacity | Grounded reflection/halo only near floor; clamp highlights, no neon fog |
| Corners | Rounded, minimum 12 px visible radius | Arc radius ≥0.25 m where aisle clearance allows; no right-angle teleport |
| Draw | One 36-frame / 1.2 s reveal beginning at frame 180: ~8-frame ease-in, ~20-frame steady travel, ~8-frame ease-out | Shared route parameter `s` and tangent; no per-segment restart at screen crossing |
| Position | One small filled dot; one expanding ring to ~1.45× over 12 frames, then fade in 10 | Same event projected near shopper floor location, never a continuous beacon |
| Destination | Small terminal circle only after route head arrives; one 1.08× pulse, then settle | Circle at walkable shelf access, thin vertical plane points to product for <1 s; no generic carton outline |
| Camera response | SVG holds crisp while UI is readable | Light core subtly increases with distance as needed to preserve perceived thickness; occlusion by shelves is correct |
| Fade/exit | Route tail fades over 10–14 frames after product contact | Visible residual segment travels into brand reveal; approved glyph is not distorted to fit route |
| Easing | No bounce or elastic spring. Acceleration is brief, travel near constant, deceleration precise. | Same `s` curve; camera/line synchronization is governed by path distance, not unrelated keyframes. |

The path starts from a position marker, carries through UI, map and world, resolves at the product, then continues as a residual graphic into the brand. Screen-space SVG and Blender floor mesh derive from the same walkable polyline. UI (u,v) and floor (x,y, Z up) use one recorded transform. A stop at a real-looking shelf is a storytelling metaphor; do not imply real-time AR, centimeter accuracy or existing retailer coverage.

## Camera and transition grammar

Use low architectural movement for uncertainty and destination, a controlled hero-phone dolly, lateral shopper reveal and a brief elevated orientation beat. Maintain forward/leftward motion across navigation cuts; never repeat overhead maps. Fast movement gets short motion blur; UI text and the 2.5-second final hold stay sharp. Avoid arbitrary camera orbits, generic route-following top-down shots, full-frame glow wipes and blur-hidden cuts. The 6–10 s camera crosses the phone screen continuously as map footprint geometry extrudes into shelves; technical construction is in [signature-shots.md](signature-shots.md). The 22–26 s ending follows the route into a brand element instead of revealing an unrelated black card.

At 720p, test whether the shopper remains visibly human, `Milch` and its result are readable, path/target relationship is clear, and the static brand holds from frame 705 through 779. If any fail, simplify the composition before adding more detail.
