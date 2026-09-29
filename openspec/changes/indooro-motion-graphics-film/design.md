## Context and source truth

Indooro is iOS first. The MVP is anonymous, one-store, one-floor product search with a 2D route line; the canonical app is `swift/indooro-EinkaeuferFinal/indooroApp`. Current specifications cover beacon-based positioning, confidence-aware map matching, walkable graph A* routing, local shopping lists/tours, and an authenticated administration platform. Repository logo files exist but the available white-logo image has a white field and red/green icon, so the film uses a vector wordmark and abstract route glyph rather than treating that PNG as a transparent overlay. The film contains an **illustrative UI concept**, not recorded production footage. The brief's 4–5 m number conflicts with a later FSD target; no accuracy number is shown.

## Decisions

1. **Framework and isolation.** `indooro-motion/` is a standalone React + TypeScript Remotion project. Keep Remotion packages version matched. `src/index.ts` registers `Root.tsx`; `Film.tsx` sequences eight scene components; `design/tokens.ts`, `components/`, `data/`, and `utils/` provide reusable systems. `public/` contains only local licensed assets. No application runtime dependency.
2. **Composition and timing.** One 1920×1080, 30 fps, 1,950-frame `IndooroFilm` composition plus individually registered scenes for review and a still composition. Scenes occupy fixed half-open ranges: 0–180, 180–390, 390–690, 690–1020, 1020–1290, 1290–1560, 1560–1770, 1770–1950. Each outgoing scene is held as a 15-frame visual layer beyond its interval while the incoming scene fades in; this overlay does not shorten or extend the master timeline. The 65-second result is exact. At every boundary a shared route, map, phone, or line motif persists visually.
3. **Animation architecture.** Scene `useCurrentFrame()` is local through Remotion `Sequence`. Shared `ease`, `reveal`, `draw`, and `camera` functions use explicit frame inputs and clamped interpolation. No wall-clock animations, CSS transitions, network fetches, or unseeded randomness. Rendered elements remain editable SVG/HTML.
4. **Map and routing.** A fixed, illustrative one-floor grid has explicit shelves as obstacles, walkable corridors, entrance, and product access nodes. A deterministic 4-neighbour A* calculation derives the single-product route. A nearest-neighbour tour plus 2-opt improvement is calculated from graph distances for the local-list visualization; the film only says the displayed example is more direct, not that the heuristic always finds a global optimum. Route paths are SVG polylines drawn by stroke dash offsets. The map is a product diagram, not a real SPAR floor plan.
5. **Phone and interface.** A CSS/SVG phone shell provides bevel, glass reflection, camera island, screen mask, and soft shadow. Screen contents are simplified German illustrative screens using the current app's search/map/list concepts. A small persistent `Konzeptdarstellung` label accompanies the detailed UI shots; this prevents the concept from appearing to be live screen capture.
6. **Camera and depth.** Use 2D layers with scale, position, rotation, and parallax instead of Three.js. This preserves deterministic, fast rendering and keeps text crisp. Camera moves stay modest (under ~8% scale/12° rotation). Shadows and radial gradient glows provide depth. Foreground phone and UI are separated from the map plane.
7. **Design assets.** Dark navy-charcoal `#071117`, deep panel `#101F26`, off-white `#F4F7F5`, mint `#63E6B4`, teal `#27B9AB`, amber `#E8B86D`. Mint is reserved for active route/position/selection. Use a locally bundled, freely licensed Inter font if available; otherwise system sans fallback. Logo is a typographic Indooro wordmark with a route glyph. No SPAR logo.
8. **Audio.** Generate an original restrained electronic bed and a few purposeful interface/transition tones as local WAV assets, with no third-party samples. Audio is frame-aligned and fades in/out. Target safe peak below −1 dBFS, restrained average level. The film remains comprehensible muted. No voice-over.
9. **Rendering.** Remotion CLI builds H.264/yuv420p main MP4 at 1920×1080/30 fps with AAC; a 960×540 preview derives from the same frames; a poster renders from the closing composition. Render scripts capture version/flags. `ffprobe` or equivalent media inspection confirms streams, dimensions, FPS, frame count, duration. Rendering may take significant time; use sequential preview checks before final export.
10. **Validation.** TypeScript typecheck, OpenSpec strict validation, route geometry tests, targeted still renders per scene, transition-boundary stills, contact sheet inspection, full video media inspection, and audio listening/level check. Fix visible clipping, weak hierarchy, text timing, and abrupt cuts before delivery. Record limitations in production report.

## Alternatives and tradeoffs

Actual app screen capture would be less illustrative but inconsistent across unfinished features and hard to animate. The vector concept keeps claims honest and enables precise choreography. A 3D engine would add rendering cost without improving the map explanation. Royalty-free stock music is unnecessary when a simple original score can be synthesized reproducibly.

## Risks and responses

- Film may imply capabilities are production proven: use a concept label, avoid numeric outcomes, document local list scope.
- Dense UI at 1080p may be unreadable: use large phone, few lines, and frame inspection at half scale.
- Font or audio assets may be missing: bundle everything used and provide fallbacks.
- Long render may fail: validate sample frames and short slices first; resume with the same deterministic source.
- Thin route lines may alias: use rounded caps, at least 6 px at output scale, and verify H.264 output.

## Migration and rollback

No application migration. The video can be revised or removed by changing/deleting `indooro-motion/` and this OpenSpec change without affecting Indooro runtime. The source project and render commands remain available for future 4K/vertical adaptations.
