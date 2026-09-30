# Proposed technical architecture — planning only

**Preferred pipeline:** Remotion + short, scripted Blender passes. Remotion owns the **26-second / 780-frame / 30 fps** master timeline, UI, 2D route, screen projection/compositing, masks, typography, sound and export. Blender Python generates the modular store, sculptural shopper, phone body, animated camera and selected 3D route/map/lighting passes. Cinema 4D, filmed footage and external video-generation services are not required. Remotion-only 2.5D variants preserve every critical narrative beat.

After explicit **prototype-production approval**, create the isolated `indooro-ad-v2/` package with timeline, shots, UI/map, graphics/audio, Blender scripts and generated-pass folders, preview outputs and asset manifest. This is proposed structure, not created now. Copy selected V1 utilities with provenance; do not import V1 production paths at render time. Pin compatible Remotion/React/TypeScript dependencies and keep deterministic seeds, local files and no network calls during render.

## Shared geometry and shot contracts

One illustrative `store-layout.json` defines shelf footprints, walkable cells, shopper start, milk shelf access point and the route polyline in floor (x,y) coordinates with Z up. Export a documented affine transform to map UI (u,v) and sample the same polyline by normalized path distance `s`. A Blender builder and TypeScript path/checking layer consume the same layout. The floor route terminates at walkable access, not inside the shelf. Path geometry, 12-frame overlap and screen projection must meet the continuity target in [signature-shots.md](../creative/signature-shots.md).

Three signature contracts govern production:
1. **Opening:** scripted low-to-high camera spline, modular store, figure masks and selective lighting; Remotion grades and introduces position/mint at frame 75. Shelves never rearrange.
2. **Phone-to-world:** Blender renders one continuous camera, phone shell/screen plane, map-footprint-to-shelf height keys, floor route and matte/depth/object-ID passes. Export frame camera matrices and screen quadrilateral. Remotion corner-pins crisp UI, coordinates the SVG-to-3D route overlap, controls grade and audio. Do not cover a camera reset with blur.
3. **Destination-to-brand:** Blender renders short route chase, shelf/carton, restrained reach and masks. Remotion owns destination circle/vertical light where cleaner, contrast reduction, residual route and approved brand graphic. If logo geometry is incompatible, route frames rather than deforms the approved mark.

Prefer frame-numbered beauty PNG or high-quality intermediate sequences for short passes, with separate alpha/depth/ID data when needed. Record color space, premultiplication, camera projection, checksum, frame range, dimensions, licensing and approval state in the manifest. Composite at fixed frame indices. [Blender's command-line manual](https://docs.blender.org/manual/en/5.1/advanced/command_line/render.html) describes background rendering; [Remotion media documentation](https://www.remotion.dev/docs/media/video) describes timeline video integration. Blender is not presently in this host's `PATH`; preflight belongs to approved prototype work.

## Fallback and staged render

For each signature shot, a Remotion composition uses layered shelf cards, continuous virtual camera transforms, SVG route, silhouette/upper-body shopper poses, occlusion masks and grading. Fallback means reduced geometric depth with the **same** path, timing, human action and transition idea. A failed Blender pass is not a reason to silently substitute a generic map cut.

The first authorized work stops at **four draft 1280×720 prototype sequences**: opening/clarity, phone/search, continuous phone-to-store, destination/brand. Use low samples/fast settings, temporary cleared audio and scratch VO only where useful. Review normal-speed muted/sound-on, continuity frames, shopper quality, UI legibility and rights. **Full navigation shots and full 26-second cut remain blocked until the four prototypes are accepted.** A later rough cut, picture lock, final mix and final-render approval are distinct gates. No V2 code, model, audio or render is produced in this planning change.
