# V1/V2 reuse matrix for the motion-graphics-only direction

Effort is a future planning estimate: S <0.5 day, M 0.5–2 days, L >2 days. “Reusable” can mean sound technical structure while its current look still needs redesign.

| Component / source | Decision | Reason / estimated adaptation |
|---|---|---|
| Remotion configuration and pinned package, `indooro-motion/package.json`, `remotion.config.ts` | Reuse with adaptation | Proven frame-based pipeline; isolate new 840-frame project and preview settings. S |
| Composition/folder pattern, `src/Root.tsx`, `src/Film.tsx` | Reuse with adaptation | Sequence registration works; rebuild 13-shot timeline and stems. M |
| Frame/easing helpers, `src/utils/motion.ts` | Reuse with adaptation | Deterministic interpolation is valuable; add figure/route camera helpers. S |
| Store graph/A* and route tests, `src/data/store.ts`, `store.test.ts` | Reuse with adaptation | Valid walkable geometry pattern; adapt to one V2 layout shared with Blender. M |
| Map SVG and markers, `src/components/Visuals.tsx` | Redesign | Existing map is clear but flat; use as source for phone view and 3D handoff. M |
| Graphite/mint tokens, `src/design/tokens.ts` | Reuse with adaptation | Strong identity anchors; add 3D material/light equivalents. S–M |
| Inter and bundled OFL notice | Reuse unchanged | Clear neutral UI and documented font license. S |
| CSS/SVG phone shell, `Visuals.tsx` | Redesign | Technically editable; scale/bevel/lighting must support hero view. Optional Blender body, no filmed phone. M |
| Search/result/map UI, `Visuals.tsx`, `Scenes.tsx` | Redesign | Core causal interaction; make bigger, shorter and trace copy to iOS specs. M |
| Wordmark/route glyph, `Visuals.tsx`, `logos/` | Reuse with adaptation | Keep route motif, but confirm approved official mark. M |
| Eight V1 scene components, `Scenes.tsx` | Rebuild | Repeated headline/map layout lacks shopper and premium camera arc. L |
| 15-frame opacity overlaps and camera patterns, `Film.tsx` | Rebuild | Replace generic crossfades with matched path/geometry transitions. M–L |
| Shopper figure and modular 3D store | New asset | No V1 equivalent; primitive procedural geometry and SVG fallback. L |
| List and admin scenes | Discard from 28 s ad | Wrong audience/story beat; preserve V1 unchanged. S to omit |
| V1 65 s synthesized score/WAV | Discard as soundtrack | No-VO bed and length do not fit short audio arc. Retain generator as technical reference only. M for new cue |
| Separate SFX/VO | New assets | Original sparse digital cues and authorized German VO, with human listening. M |
| Render scripts, ignored generated media, hash manifest | Reuse with adaptation | Strong reproducibility policy; add Blender-pass hashes and short-range previews. S–M |
| V1 storyboard, QA report and OpenSpec | Historical reference only | Preserve evidence and technical QA standards; V2 owns new timing/requirements. S |

No live-action footage, actor release, location permission or stock clip is a prerequisite. The existing V1 implementation and render remain intact.
