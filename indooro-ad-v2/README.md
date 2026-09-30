# Indooro V2 — seven scene passes and 26-second rough cut

This isolated project began with four approved 1280×720 / 30 fps signature prototypes. After the user's explicit acceptance, it gained the three navigation passages and an **internal 26-second / 780-frame rough cut**. This is an editable preview, not picture lock, final voice/audio, approved brand artwork or a 1080p master.

## Reproduce locally

Requirements: Node 24 (or compatible), npm, Blender 5.2 CLI and FFmpeg for optional media probing. From this directory:

```bash
npm ci
python3 scripts-generate-temp-audio.py
python3 scripts-generate-roughcut-audio.py
blender -b --factory-startup --python blender/scripts/render_prototype.py -- P1
blender -b --factory-startup --python blender/scripts/render_prototype.py -- P3
blender -b --factory-startup --python blender/scripts/render_prototype.py -- P4
blender -b --factory-startup --python blender/scripts/render_prototype.py -- P5
blender -b --factory-startup --python blender/scripts/render_prototype.py -- P6
blender -b --factory-startup --python blender/scripts/render_prototype.py -- P7
npm run lint
npm run render:rough
```

Blender writes 120 PNGs each for P1/P3/P4, 75 each for P5/P6 and 90 for P7 under `public/3d-passes/<kind>/`. P1/P3/P4 also export small camera projection JSON files. Generated PNGs, temporary WAVs and MP4s are ignored by Git; regenerate from source. P4 uses its final Blender frame for the route-to-brand section. `npm run dev` opens the seven scenes and the full rough-cut composition. The new MP4 is `previews/IndooroV2-roughcut-720p.mp4`.

## Source and review boundaries

- `src/data/store-layout.json` is the shared meter-based store/route source for Blender and Remotion. It is **illustrative**, independent of a live backend or retailer layout.
- The P2 UI uses the current Swift search pattern (`Produkt suchen...`, result selection, map) as a concept rendering. The small on-screen `Konzeptdarstellung` label is intentional. Product position and spatial route are storytelling visuals, not measured navigation or an AR feature claim.
- `INDOORO` and `Finde deinen Weg.` at the end are a **provisional brand treatment**. Confirm the official logo master before full-film production; no third-party brand art is embedded in these drafts.
- The generated WAVs are original **temporary internal review cues**. No final narration, music or licensed sample has been made or approved. Timing slots for recommended VO A remain in OpenSpec.
- P1/P3/P4/P5/P6/P7 have Blender world passes. P2 phone and all UI/brand graphics remain in Remotion. The route, shopper and carton are generated, without footage or external stock assets.
- Blender now applies deterministic procedural roughness, color variation and fine bump to the coat, shelf metal, floor and carton paper. The coat has a smoother sculptural mesh, the store uses muted unbranded product variety, and the generic carton has an original printed `MILCH` label. P5–P7 add a restrained procedural step pose. These are material and silhouette improvements within the stylized concept, not photoreal human modeling.
- The original four MP4s and `previews/MANIFEST.sha256` record the earlier accepted prototype exports. Re-rendering those compositions with the upgraded Blender passes produces revised files and changes their hashes. The rough cut has its own review record.
- The current P3 joins a continuous Blender camera pass to a scaled vector map through a composited overlap. It tests the screen-entry idea, but the map-to-shelf match and shopper finish need human review. If the geometry match does not read at normal speed, the approved fallback is one continuous Remotion camera across layered shelf cards, using the same layout and route rather than a hidden cut.
- P4's brand typography is a temporary treatment; its figure reach is a motion test, not approved character animation. Avoid treating the route and milk placement as a live positioning claim.
- The user's acceptance of the four initial prototypes is recorded in OpenSpec. The rough cut now needs normal-speed story, motion, UI, character and sound review before picture lock or final-quality work. The original `previews/prototype-review.md` remains the prototype record.
