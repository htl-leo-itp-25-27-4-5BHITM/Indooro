# Technical architecture — four draft prototypes implemented

**Preferred pipeline:** Remotion + short, scripted Blender passes. Remotion owns the **26-second / 780-frame / 30 fps** master timeline, UI, 2D route, screen projection/compositing, masks, typography, sound and export. Blender Python generates the modular store, sculptural shopper, phone body, animated camera and selected 3D route/map/lighting passes. Cinema 4D, filmed footage and external video-generation services are not required. Remotion-only 2.5D variants preserve every critical narrative beat.

The isolated `indooro-ad-v2/` package now contains only the four authorized draft compositions, shared layout, UI/map graphics, Blender script, original scratch cues and local preview outputs. It has no complete-film composition or navigation shots 05–07. Remotion/React/TypeScript versions are pinned. The V1 project is not imported at render time. See [prototype review](../../../../indooro-ad-v2/previews/prototype-review.md) for verified output and differences from the target contracts.

## Shared geometry and shot contracts

One illustrative `store-layout.json` defines shelf footprints, walkable cells, shopper start, milk shelf access point and the route polyline in floor (x,y) coordinates with Z up. Export a documented affine transform to map UI (u,v) and sample the same polyline by normalized path distance `s`. A Blender builder and TypeScript path/checking layer consume the same layout. The floor route terminates at walkable access, not inside the shelf. Path geometry, 12-frame overlap and screen projection must meet the continuity target in [signature-shots.md](../creative/signature-shots.md).

Three signature contracts govern production:
1. **Opening:** scripted low-to-high camera spline, modular store, figure masks and selective lighting; Remotion grades and introduces position/mint at frame 75. Shelves never rearrange.
2. **Phone-to-world:** Blender renders one continuous camera, phone shell/screen plane, map-footprint-to-shelf height keys, floor route and matte/depth/object-ID passes. Export frame camera matrices and screen quadrilateral. Remotion corner-pins crisp UI, coordinates the SVG-to-3D route overlap, controls grade and audio. Do not cover a camera reset with blur.
3. **Destination-to-brand:** Blender renders short route chase, shelf/carton, restrained reach and masks. Remotion owns destination circle/vertical light where cleaner, contrast reduction, residual route and approved brand graphic. If logo geometry is incompatible, route frames rather than deforms the approved mark.

The current drafts use frame-numbered Blender beauty PNGs and committed per-frame projection JSON for P1/P3/P4. Separate alpha/depth/ID passes, exact 2 px route correspondence and final color pipeline are **not yet implemented**; they remain conditions for any full-quality shot. A SHA-256 manifest records the four local MP4s. [Blender's command-line manual](https://docs.blender.org/manual/en/5.1/advanced/command_line/render.html) and [Remotion media documentation](https://www.remotion.dev/docs/media/video) support the chosen command-line pipeline. Blender 5.2.2 CLI and FFmpeg were installed and exercised for prototypes.

## Fallback and staged render

For each signature shot, a Remotion composition uses layered shelf cards, continuous virtual camera transforms, SVG route, silhouette/upper-body shopper poses, occlusion masks and grading. Fallback means reduced geometric depth with the **same** path, timing, human action and transition idea. A failed Blender pass is not a reason to silently substitute a generic map cut.

The first authorized work stops at **four draft 1280×720 prototype sequences**: opening/clarity, phone/search, continuous phone-to-store, destination/brand. They use fast draft settings and generated scratch sound, with no VO. Human normal-speed muted/sound-on review, shopper quality, UI legibility and brand/voice rights are pending. **Full navigation shots and the complete 26-second cut remain blocked until the four prototypes are accepted.** A later rough cut, picture lock, final mix and final-render approval are distinct gates.
