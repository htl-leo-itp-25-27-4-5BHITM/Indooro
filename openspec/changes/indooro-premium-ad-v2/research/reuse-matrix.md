# V1 reuse matrix

Effort is a planning estimate for **future approved production**, not work started here: S <0.5 day, M 0.5–2 days, L >2 days. Technical reuse does not imply the existing look suits the new film.

| Component / file | Decision | Why / future effort |
|---|---|---|
| Remotion configuration and package, `indooro-motion/package.json`, `remotion.config.ts` | Reuse with minor changes | Version-matched, deterministic base; new 30/32 s compositions and preview presets in separate project. S |
| Source architecture, `src/Root.tsx`, `Film.tsx` | Reuse with significant redesign | Sequence/registration pattern works; V2 needs shot-level timeline, stems and footage. M |
| Frame-based easing, `src/utils/motion.ts` | Reuse with minor changes | Reliable clamped interpolation; add controlled camera/transition helpers. S |
| Palette/tokens, `src/design/tokens.ts` | Reuse with significant redesign | Mint/charcoal useful brand anchor; warm physical footage needs calibrated contrast and skin tones. M |
| Inter typography and OFL license, `public/fonts/INTER-LICENSE.txt` | Reuse unchanged | Clear neutral UI type with documented license; verify chosen weights. S |
| Phone shell, `src/components/Visuals.tsx` | Reuse with significant redesign | Editable shell is technically useful; small dark screen is visually too distant. Build hero close-ups and track filmed hand geometry. M–L |
| Search UI, `Visuals.tsx`, `Scenes.tsx` | Reuse with significant redesign | Search/result/map sequence is core; use real app reference, larger readable states and fingertip causality. M |
| Map graphic / route / markers, `Visuals.tsx`, `src/data/store.ts` | Reuse with significant redesign | Tested walkable graph is valuable; existing schematic should be reframed as illustrative navigation overlay tied to a filmed move. M–L |
| Shopping list visualization, `Scenes.tsx` | Do not reuse in 32 s V2 | Secondary benefit costs narrative time. Save for separate spot. S to omit |
| Admin editor scene, `Scenes.tsx` | Do not reuse | Wrong audience and chapter for customer ad. S to omit |
| Eight scene compositions, `Scenes.tsx` | Rebuild completely | Same split layout and holds produce V1 pacing. New shot architecture. L |
| Camera and opacity overlaps, `Scenes.tsx`, `Film.tsx` | Rebuild completely | Crossfades lack physical/digital continuity; plan tracked match cuts and motivated camera motion. L |
| Wordmark and route glyph, `Visuals.tsx`; `logos/` | Reuse with significant redesign | Recognizable route cue; compare against actual approved Indooro mark, avoid treating concept glyph as official without approval. M |
| Existing score WAV and generator, `public/audio/`, `scripts/generate-audio.mjs` | Do not reuse as soundtrack; generator may be redesigned | 65 s no-VO bed does not match new arc; original short synthesis can inform new UI signature only after listening. M |
| Separate SFX | Rebuild completely | V1 has no documented multitrack SFX library; design sparse action-linked sounds. M |
| Render scripts and export policy, `package.json`, `.gitignore` | Reuse with minor changes | Reproducible H.264, ignored binaries and hash manifest pattern; add low-resolution ranges and stem checks. S |
| Route tests and QA/report docs, `store.test.ts`, `exports/indooro-production-report.md`, V1 quality checklist | Reuse with minor changes | Tested geometry and QA structure; extend to footage rights, VO and human narrative. M |
| Existing V1 storyboards/OpenSpec | Reuse as historical reference only | Preserve as audit evidence, do not turn its scene order into V2. S |

There is no authorized real customer/store footage in the inspected V1 assets. The brand `logos/` directory contains static variants; rights and final approved lockup need confirmation before a public advertisement.
