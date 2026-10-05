# Technical architecture — seven scenes and 720p rough cut implemented

**Preferred pipeline:** Remotion + short, scripted Blender passes. Remotion owns the **26-second / 780-frame / 30 fps** master timeline, UI, 2D route, screen projection/compositing, masks, typography, sound and export. Blender Python generates the modular store, sculptural shopper, phone body, animated camera and selected 3D route/map/lighting passes. Cinema 4D, filmed footage and external video-generation services are not required. Remotion-only 2.5D variants preserve every critical narrative beat.

The isolated `indooro-ad-v2/` package now contains seven editable scene compositions and an `IndooroV2RoughCut` composition at 780 frames. P5–P7 supply the missing navigation; a single original 26-second scratch score spans the edit. Remotion/React/TypeScript versions are pinned. The V1 project is not imported at render time. See [prototype review](../../../../indooro-ad-v2/previews/prototype-review.md) and [rough-cut review](../../../../indooro-ad-v2/previews/roughcut-review.md) for verified outputs and limits.

## Shared geometry and shot contracts

One illustrative `store-layout.json` defines shelf footprints, walkable cells, shopper start, milk shelf access point and the route polyline in floor (x,y) coordinates with Z up. Export a documented affine transform to map UI (u,v) and sample the same polyline by normalized path distance `s`. A Blender builder and TypeScript path/checking layer consume the same layout. The floor route terminates at walkable access, not inside the shelf. Path geometry, 12-frame overlap and screen projection must meet the continuity target in [signature-shots.md](../creative/signature-shots.md).

Three signature contracts govern production:
1. **Opening:** scripted low-to-high camera spline, modular store, figure masks and selective lighting; Remotion grades and introduces position/mint at frame 75. Shelves never rearrange.
2. **Phone-to-world:** Blender renders one continuous camera, phone shell/screen plane, map-footprint-to-shelf height keys, floor route and matte/depth/object-ID passes. Export frame camera matrices and screen quadrilateral. Remotion corner-pins crisp UI, coordinates the SVG-to-3D route overlap, controls grade and audio. Do not cover a camera reset with blur.
3. **Destination-to-brand:** Blender renders short route chase, shelf/carton, restrained reach and masks. Remotion owns destination circle/vertical light where cleaner, contrast reduction, residual route and approved brand graphic. If logo geometry is incompatible, route frames rather than deforms the approved mark.

The current draft uses frame-numbered Blender beauty PNGs for six 3D passages and committed per-frame projection JSON for P1/P3/P4. Procedural shaders supply coat weave, shelf metal, floor and carton paper response; there are no external image textures. Separate alpha/depth/ID passes, exact 2 px route correspondence and final color pipeline are **not yet implemented**; they remain conditions for full-quality shots. SHA-256 manifests record the original four prototype MP4s and the rough cut separately. [Blender's command-line manual](https://docs.blender.org/manual/en/5.1/advanced/command_line/render.html) and [Remotion media documentation](https://www.remotion.dev/docs/media/video) support the command-line pipeline.

## Fallback and staged render

For each signature shot, a Remotion composition uses layered shelf cards, continuous virtual camera transforms, SVG route, silhouette/upper-body shopper poses, occlusion masks and grading. Fallback means reduced geometric depth with the **same** path, timing, human action and transition idea. A failed Blender pass is not a reason to silently substitute a generic map cut.

The first authorized work stopped at **four draft 1280×720 prototype sequences**. After the user accepted them, navigation and the complete 26-second cut were built at the same draft size. Human normal-speed muted/sound-on review of this new cut, shopper quality, P3 continuity, UI/brand claims and voice rights remain pending. Picture lock, final mix and final-render approval are distinct later gates.
