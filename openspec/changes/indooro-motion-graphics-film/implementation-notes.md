# V1 implementation audit against the planned storyboard

This records the V1 source as found on 2026-09-29. The storyboard remains the **original plan**, not a claim that every described transition was produced. `src/scenes/Scenes.tsx`, `src/components/Visuals.tsx`, `src/Film.tsx`, and `src/data/store.ts` are the implementation evidence. Frame stills and media probes are recorded in `indooro-motion/exports/indooro-production-report.md`. Full-length subjective playback and audio listening are still pending.

| Scene | Implemented | Planned detail absent or different |
|---|---|---|
| 01 Problem | Amber route draws over a rotating shelf grid; question and support text appear. | The amber route does not transform into a mint line at the cut. |
| 02 Identity | Vector route glyph, wordmark, support line, and tilted phone enter. | The glyph is drawn as a static SVG; the incoming line does not curl into it. The phone shows a home concept screen, not a routed screen. |
| 03 Search | `Milch` types into the illustrative phone search, result appears, then phone switches to a map. | The search-to-map switch is a component mode change. There is no distinct selection pulse or pin expansion into scene 04. |
| 04 Position | Beacon rings and a map marker appear; the marker moves along cells of the computed milk route. | There is no uncertain-position cloud or measured positioning input. This is an explanatory simulation. |
| 05 Route | A* computes the route through walkable cells; a mint path draws over the grid. | The node wave uses Manhattan distance from the entrance; it is **not** the A* visited set. No candidate edge trace or traveling arrowhead is rendered. OpenSpec task 6.5 remains open. |
| 06 List | Four products, two visit orders, and their graph-based routes appear. The example improves from 59 to 31 grid steps. | Cards and maps crossfade between orders; rows do not physically reorder. This is an illustrative local example, not a universal shortest-route result. |
| 07 Admin | An illustrative editor highlights a shelf and fades in a product assignment label. | `✓ Gespeichert` is visible from the start rather than transitioning from a save action. No actual editor/backend interaction is shown. |
| 08 Hero | Wordmark, claim, phone map, and project credit settle; a standalone poster composition exists. | The glyph is static rather than drawn. The project credit completes at local frame 95, leaving 85 fully settled frames before frame 1949, not the planned 90. OpenSpec task 6.8 remains open. |

Across scenes, `Film.tsx` uses 15-frame opacity overlaps and recurring map/phone colors. It does not implement the planned literal line-to-icon, phone-to-map, or map-to-editor morphs. These are accepted V1 implementation differences for handover, not retroactively edited into the original storyboard.

The V1 design explicitly omitted narration. The user's subsequent V2 feedback requests a professional, natural German voice and a shorter, more human-centered premium advertisement. That is a new direction, not a completed V1 requirement.
