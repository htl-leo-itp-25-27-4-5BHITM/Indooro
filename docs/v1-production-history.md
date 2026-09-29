# Indooro motion film V1 — production history and preservation

Status recorded on 2026-09-29. This report distinguishes the original plan, committed source, local exports, and unverified creative acceptance. The film is an illustrative project advertisement, not evidence of store deployment or measured positioning accuracy.

## Objective and original concept

The original OpenSpec change, `openspec/changes/indooro-motion-graphics-film/`, proposed a 65-second German motion graphics explainer for product search, indoor positioning, a walkable route, a local shopping-list tour, administration, and the brand. The eight planned scenes occupy frames 0–179, 180–389, 390–689, 690–1019, 1020–1289, 1290–1559, 1560–1769, and 1770–1949 at 30 fps. The original design deliberately omitted narration. Its UI, map and admin screen are concepts, marked `Konzeptdarstellung`; they are not app capture or a real supermarket layout.

## Actual implementation

`indooro-motion/` is a separate React/TypeScript Remotion 4.0.530 package. `src/Root.tsx` registers the master film, eight scene compositions and a poster. `src/Film.tsx` sequences the scenes with 15-frame opacity overlaps and plays one WAV bed at 0.8 volume. `src/scenes/Scenes.tsx` contains the eight scenes. `src/components/Visuals.tsx` builds the vector map, phone, wordmark, labels and UI. `src/design/tokens.ts` fixes the palette and timing; `src/utils/motion.ts` holds frame-based interpolation. `src/data/store.ts` holds an illustrative walkable grid, A* single-product route and nearest-neighbour/2-opt list example; `store.test.ts` checks route geometry and the example improvement. `scripts/generate-audio.mjs` synthesizes the stereo score without samples. Inter's license is bundled in `public/fonts/INTER-LICENSE.txt`.

The result follows the broad storyboard but not all specified transitions. The amber line does not morph into the identity glyph; search-to-map is a UI mode switch; the A* node wave represents Manhattan distance rather than the actual visited set; list cards crossfade rather than reorder physically; the admin save check is visible from the beginning. The final project credit settles at local frame 95, yielding 85 fully settled frames rather than the planned 90. These differences are itemized in `openspec/changes/indooro-motion-graphics-film/implementation-notes.md` and reflected in its tasks and quality checklist.

## Work and verification state

The original OpenSpec tasks mark discovery, creative direction, architecture, reusable components, all eight scene builds except the exact A* exploration criterion, audio synthesis, rendering, and technical export checks as complete. Tasks 6.5, 6.8, 8.2 and 9.1 remain open because the A* wave, ending hold, full audio audition, and continuous full-film viewing were not verified. A checked task is a historical claim in the task file, not proof of commercial creative acceptance.

The existing production report records successful clean installation, lint/typecheck, two route tests, deterministic frame comparison, OpenSpec strict validation, still checks and media probes. During this handover, the final MP4 was independently probed: 1920×1080 H.264, 30 fps, 1,950 video frames, 65.045-second container duration, stereo AAC at 48 kHz. The video track is 65.000 seconds; the container includes the AAC tail. Extracted final-video frames were inspected across all eight scenes. The embedded mix measured −21.83 LUFS integrated, −8.39 dBTP and 1.30 LU loudness range with FFmpeg loudnorm analysis; these figures cannot establish musical or mix quality. There was no audio audition or continuous full-length playback in this handover environment.

## Local assets and exports

The final and preview MP4s, poster PNG and generated WAV remain in `indooro-motion/exports/` and `indooro-motion/public/audio/`. The final MP4 is 8.3 MB, the preview 4.5 MB and WAV 11 MB. These generated binaries are ignored by Git; `indooro-motion/exports/MANIFEST.sha256` records their hashes. Source, generator, delivery report and storyboard are tracked. A fresh checkout can reproduce the assets using the commands in `indooro-motion/README.md`, but the exact existing exports must be copied separately if bit-identical preservation is required. `indooro-motion/previews/` contains local review artifacts and is ignored.

## Actual Git sequence

The original planning was committed in stages: tooling/media policy (`0bebace`), proposal/design (`2e00aa9`), six capability specs (`c2137a0`), creative direction/storyboard (`4353095`), and animation/audio/render plans (`7b3b396`). The production source was then committed as a scaffold (`340f043`), tokens (`451dd0f`), motion helpers (`b3040de`), graph and route logic (`efacd8e`), route tests (`8d2e95f`), shared visuals (`3d7e8d3`), eight scenes (`de2e452`), procedural audio (`60f4286`), composition assembly (`ea3179e`), reproduction rules/license (`c8672b1`), implementation audit (`9a98f97`), and delivery report/hash manifest (`7dd5dcb`). These are the actual repository commits; this report does not assign earlier dates or claim that generated media were committed.

The two unrelated untracked files `docs/PROJECT_HANDOVER.md` and `documentation/LEOCLOUD_HOSTING_GUIDE_GENERAL.md` existed before this handover and are deliberately excluded from film commits. No V1 source or render was deleted or rewritten for the V2 concept work.

## Known creative limitation

The film's visual language is coherent and technically editable, but the screen evidence shows a diagram-led explainer: mostly fixed left headlines and right map/phone panels; long, similar holds; no filmed person, hand, aisle or physical product discovery; and separate explanatory algorithm/admin chapters. The customer never enters the image. These are the central reasons to develop a new advertisement. The full evidence and scene timings are in the V2 research documents, rather than retroactively rewriting the original concept.
