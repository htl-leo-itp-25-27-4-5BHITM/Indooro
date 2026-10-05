# V1 project audit — evidence ledger

Evidence inspected 2026-09-29: the committed V1 OpenSpec change, `indooro-motion/` source and production report, `indooro-motion/exports/indooro-motion-graphics-final.mp4`, extracted frames at 24 points from 1–64 s, FFprobe, FFmpeg audio analysis, root product specs, and Git history. The chronological contact sheet `research/v1-contact-sheet.jpg` preserves the sampled encoded frames as review evidence. Still-frame evidence supports composition, content and state changes; it does not prove a full moving-picture or listening experience.

| Area | Planned | Delivered / verified | Limit |
|---|---|---|---|
| Narrative | Eight-scene 65 s explainer | Eight Remotion scenes, 1,950 frames/30 fps | No human, live shopping action, or VO |
| UI | Illustrative search/map/admin concepts | Vector/CSS phone, simplified map and editor labeled `Konzeptdarstellung` | Not app capture; no real store shown |
| Routing | Walkable A* and local list | `store.ts` implements example graph, A* final path, nearest-neighbour/2-opt list; two tests pass | Graph and 59→31 step result are illustrative; A* wave is not actual visited set |
| Motion | Continuous route motif and scene morphs | Frame-based transforms and 15-frame opacity overlaps | Multiple specified morphs resolve as cuts/crossfades |
| Audio | Original bed and precise effects, no VO | Procedural WAV from `scripts/generate-audio.mjs`; embedded AAC stereo | Mix has not been auditioned |
| Exports | Full HD final, half-size preview, poster | Local files and SHA-256 manifest verified | Generated binaries ignored by Git; must copy or rerender elsewhere |

Git initially held five V1 planning commits and untracked production source. During preservation the existing source was split into genuine architecture, route, UI, scene, audio and delivery commits. `docs/v1-production-history.md` records the sequence and outstanding V1 tasks. `indooro-motion-v1-baseline` points to the last preservation commit. The unrelated pre-existing untracked handover and hosting documents were excluded.

Product truth is constrained by `openspec/specs/ios-store-map-experience/spec.md`, `mobile-positioning-navigation/spec.md`, `mobile-shopping-lists/spec.md`, and `product-catalog-search/spec.md`. The canonical iOS tree is `swift/indooro-EinkaeuferFinal/indooroApp`. V2 may depict product search, map and a route concept, but cannot claim verified live positioning accuracy, universal availability, retailer partnership, time saved, or an identical shipping UI without proof. The brief's 4–5 m number is a development target; other repository docs carry different targets, so the ad should omit accuracy figures entirely.
