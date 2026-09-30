# Indooro V2 — four signature prototypes

This isolated project contains **only four approved 1280×720 / 30 fps draft sequences**, not the full 26-second advertisement. P1 is frames 0–119 (4 s), P2 120–179 (2 s), P3 180–299 (4 s), and P4 540–779 (8 s) from the planning timeline. Navigation shots 05–07 and a complete-film composition are deliberately absent pending explicit prototype acceptance.

## Reproduce locally

Requirements: Node 24 (or compatible), npm, Blender 5.2 CLI and FFmpeg for optional media probing. From this directory:

```bash
npm ci
python3 scripts-generate-temp-audio.py
blender -b --factory-startup --python blender/scripts/render_prototype.py -- P1
blender -b --factory-startup --python blender/scripts/render_prototype.py -- P3
blender -b --factory-startup --python blender/scripts/render_prototype.py -- P4
npm run lint
npm run render:p1
npm run render:p2
npm run render:p3
npm run render:p4
```

Each Blender command generates 120 local PNGs under `public/3d-passes/<kind>/` plus a small committed camera projection JSON under `src/data/`. The PNGs, temporary WAVs and MP4s are ignored by Git; regenerate from source. The P4 Remotion composition uses its final Blender frame for the route-to-brand section. `npm run dev` opens the four independent Remotion compositions. Output MP4s go into `previews/`.

## Source and review boundaries

- `src/data/store-layout.json` is the shared meter-based store/route source for Blender and Remotion. It is **illustrative**, independent of a live backend or retailer layout.
- The P2 UI uses the current Swift search pattern (`Produkt suchen...`, result selection, map) as a concept rendering. The small on-screen `Konzeptdarstellung` label is intentional. Product position and spatial route are storytelling visuals, not measured navigation or an AR feature claim.
- `INDOORO` and `Finde deinen Weg.` at the end are a **provisional brand treatment**. Confirm the official logo master before full-film production; no third-party brand art is embedded in these drafts.
- The generated WAVs are original **temporary internal review cues**. No final narration, music or licensed sample has been made or approved. Timing slots for recommended VO A remain in OpenSpec.
- P1/P3/P4 have Blender world passes. P2 phone and all UI/brand graphics remain in Remotion. The route, shopper and carton are generated, without footage or external stock assets.
- The current P3 joins a continuous Blender camera pass to a scaled vector map through a composited overlap. It tests the screen-entry idea, but the map-to-shelf match and shopper finish need human review. If the geometry match does not read at normal speed, the approved fallback is one continuous Remotion camera across layered shelf cards, using the same layout and route rather than a hidden cut.
- P4's brand typography is a temporary treatment; its figure reach is a motion test, not approved character animation. Avoid treating the route and milk placement as a live positioning claim.
- Review results and the acceptance gate are recorded in `previews/prototype-review.md`. Each MP4 still needs a human normal-speed viewing both muted and with the temporary cues before full-film production.
