## Context

V1 is preserved at `indooro-motion-v1-baseline`; its route tests, vector UI/map and deterministic Remotion helpers are useful, but its film has no visible shopper. The first V2 live-action plan was replaced by a fully AI-producible Remotion/Blender motion ad. This revision keeps that foundation and resolves three creative weaknesses documented in [final-creative-audit.md](review/final-creative-audit.md): weak opening, matched-cut phone handoff and ordinary found/logo ending. Blender is not currently in `PATH`; that affects future preflight, not planning.

## Goals / Non-Goals

**Goals:** A **26-second / 780-frame / 30 fps**, nine-shot, 16:9 premium advertisement with a sculptural shopper, readable `Milch` search, one coherent route, three memorable signature moments, short German VO, distinctive electronic sound and prototype-first gates.

**Non-Goals:** This planning request creates no V2 package, scene, model, prototype, audio or render. The future film requires no photographed actor, location, stock footage, photoreal rig, C4D or remote video-generation service. It does not explain algorithms, shopping lists, admin features, measured accuracy or retailer availability.

## Decisions

1. **Story and timing.** Nine shots span 0–780 half-open frames: opening/clarity 0–120, phone/search 120–180, continuous screen crossing 180–300, navigation 300–540, destination 540–660, brand 660–780. At provisional 120 BPM, 13 four-beat bars span 26 s. Final identity is static from frame 705, a 2.5 s hold. The same shopper and milk target persist.
2. **Three signature moments.** Opening camera flies low, turns and cranes to the shopper; Indooro activation changes light/attention, never shelf positions. The hero camera enters the phone display while map footprints extrude to shelf geometry and one path gains floor depth. A floor-level route finds a precise shelf access marker, shopper reaches milk, and a residual line becomes or frames the approved brand. [signature-shots.md](creative/signature-shots.md) defines frames, cameras, sound, Blender/Remotion duties, passes, failure points and fallbacks.
3. **Shopper.** Use realistic adult proportions, coherent jacket/trouser/shoe volumes, matte graphite fabric/ceramic treatment and four restrained poses. No face, exposed primitive joints, complex fingers, cloth physics or full walk-cycle dependency. Body posture, camera and light convey emotion; upper-body/partial/silhouette framing is the fallback.
4. **Route identity and geometry.** One `store-layout.json` will define shelf footprints, walkable path and target access. TypeScript and Blender consume it; a recorded floor-to-UI transform and path-distance parameter `s` keep SVG and 3D routes aligned. At 1080p target core is 8 px; world ribbon ~0.055 m, adjusted by camera test. Draw accelerates then cruises/settles over 36 frames at frame 180; corners round; position ripples once; destination circle pulses once; residual path connects to brand. These are prototype design targets, not verified pixels.
5. **Production choice.** Remotion owns 780-frame edit, React/SVG UI, route timing, projection composite, masks, type, sound and export. Blender Python is preferred for short architectural camera/store/phone/shopper passes, map-to-shelf extrusion and depth/ID/screen matte data. Cinema 4D adds needless complexity. Every signature has a Remotion 2.5D fallback retaining its narrative idea; no filmed footage is needed.
6. **Screen crossing.** Use one scripted continuous camera from phone hero into store. Export camera matrices and phone-screen corners per frame; Remotion corner-pins UI, overlaps the route with Blender's floor mesh for 12–18 frames and clears the screen matte as the camera crosses. Geometry and projected route must align within roughly 2 px at 720p in the overlap. Do not disguise a reset with blur. If the composite fails, maintain a single Remotion 2.5D virtual camera with map-to-shelf extrusion.
7. **VO and score.** Recommend minimal Script A: “Zu viel auf einmal. Ein Weg genügt. Indooro. Finde deinen Weg.” Estimated voiced time 5.2 s. Let 6–22 s hero transition/navigation/product arrival largely breathe. One evolving two-tone Indooro route sound changes from digital to spatial and resolves at destination/brand. Thirteen-bar score supports tension, clarity, movement and release; human listening remains required.
8. **Approval stages.** Current work ends with creative documentation. Explicit user approval permits **only four 1280×720 draft prototypes** (opening, phone/search, phone-to-store, destination/brand), with temporary cleared audio/scratch voice where useful. Human review and explicit prototype acceptance are required before navigation shots or the full cut. Later rough-cut, picture-lock, audio and final-render gates remain separate.

## Risks / Trade-offs

A more ambitious one-camera screen crossing increases projection, masking, route alignment and render risk. The continuous 2.5D fallback preserves the idea. The architectural opening can feel generic or hide the shopper; the first prototype tests its pause/reveal and selective light change. A simple 3D human can feel cheap; fewer, stronger poses and partial framing are preferable to fragile realism. A route-to-logo morph may violate official brand geometry; the line can frame the approved mark instead. All three moments need 720p normal-speed review before full production. Details and triggers are in [production-risks.md](production/production-risks.md).

## Migration Plan

There is no app or V1 migration. After explicit authorization for prototype production, preflight tools/rights, create isolated V2, produce four drafts only, review/approve them, then decide separately on full production. Preserve V1 source and exports. Do not archive this change until a future final delivery is actually accepted.

## Open Questions

Approval for prototype production; approved brand mark, exact illustrative UI copy/disclosure, voice source/rights, delivery channels/aspect ratios and optional spend. These do not authorize a full-film build by silence or assumption.
