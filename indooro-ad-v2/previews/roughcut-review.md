# Indooro V2 — 26-second rough-cut review

**Current deliverable:** `IndooroV2-roughcut-720p.mp4` is an internal review film, assembled after the user accepted the four signature prototypes. It is **not** picture lock, the final German voice/music mix, approved logo art or a 1080p master. The spatial line and UI are illustrative concept imagery.

## Timeline and ownership

| Master time | Frames | Picture | Producer |
|---|---:|---|---|
| 0–4 s | 0–119 | Low store flight, shopper and activation | Blender P1; Remotion hierarchy/marker |
| 4–6 s | 120–179 | `Milch` search, result and map | Remotion P2 |
| 6–10 s | 180–299 | Phone/map to store and route | Blender P3; Remotion phone/map composite |
| 10–12.5 s | 300–374 | Low route chase | Blender P5; Remotion edit |
| 12.5–15 s | 375–449 | Lateral shopper reveal | Blender P6; Remotion edit |
| 15–18 s | 450–539 | Overhead turn, descent | Blender P7; Remotion edit |
| 18–26 s | 540–779 | Milk destination, reach and route-to-brand | Blender P4; Remotion marker/brand |

`IndooroV2RoughCut` joins these seven editable scenes without gaps. The nine-shot storyboard remains represented: P1 covers shots 01–02 and P4 covers shots 08–09. The final identity is static from global frame 705 through 779.

## 3D model and texture upgrade

- The shopper's coat is a continuous, smoothed sculptural mesh with revised adult proportions, lower-profile shoulders, collar and a subdued graphite weave. Blender shader nodes generate fine bump, roughness and color variation; no downloaded bitmap or stock model is required.
- The shelf kit now uses restrained stock sizes and a muted three-material palette. Shelves and floor receive different procedural brushed/grain responses under the same dark lighting system.
- The unbranded milk carton has a folded top, paper grain, printed `MILCH` and a pale mint panel. The destination arm uses two tapered sleeve sections and a small hand instead of an extending bar.
- The navigation figure gets short procedural leg and shoe offsets rather than one repeated full walk cycle. It remains **stylized**. Its body rig, hands and gait are not yet final-quality character animation.

These improvements make the materials and product more legible while keeping the production fully scripted. They are not photoreal textures or a realistic human performance.

## Technical and sampled-frame checks

- `ffprobe -count_frames` reports H.264, 1280×720, 30 fps and exactly **780 video frames**. AAC encoder padding extends the container to 26.048 s; picture length is 26.000 s.
- All expected Blender beauty PNGs exist: P1/P3/P4 120 each; P5/P6 75 each; P7 90. No required frame is missing.
- ESLint, TypeScript, walkable-layout validation and strict OpenSpec validation pass. The SHA-256 checksum is in `ROUGH-CUT.sha256` and verifies the local MP4 from this directory.
- Two independent Remotion still renders at master frames 705 and 779 have identical hashes, confirming the 75-frame static brand hold in source.
- Sampled cut frames show near-matched geometry at 9.97–10.00 s (P3→P5). The P7→P4 boundary at 17.97–18.00 s retains a visible mint line after its start was moved to route progress 0.92. The lateral/overhead cuts are intentional changes of viewpoint.
- The 48 kHz stereo soundtrack is generated locally from oscillators and envelopes. It marks activation, selection, route entry, movement, destination and brand. The encoded file measures about −12.1 dBFS peak and −26.5 dBFS mean; this is **scratch audio**, not a loudness-compliant final mix. There is no German VO yet, and no human listening signoff is claimed.

## What to inspect before picture lock

1. **0–4 s:** Does the opening convey a search problem, and does the activation make the shopper's situation clearer without explanatory text?
2. **4–10 s:** Is `Milch` readable at normal speed? Does the screen-entry feel continuous? P3 still uses a designed vector/3D overlap rather than a final corner-pinned matte with a verified 2 px geometric match.
3. **10–18 s:** Does the shopper visibly follow the same route, or does the simplified gait still read as sliding? Is the overhead time compression easy to follow?
4. **18–22 s:** Can a first-time viewer identify the exact milk carton and the reach? Is the shelf light connector subtle enough to read as editorial guidance rather than an AR feature claim?
5. **22–26 s:** Does the residual line lead naturally to the brand, and is the final wordmark/claim legible for 2.5 s? The typography is provisional until the official mark is selected.
6. **Sound-on:** Is the evolving two-note route idea useful? The music and voice still need authorized sourcing/creation and actual listening on laptop, phone and headphones.

The render and sampled frames establish a reproducible continuous draft. They do not replace a human normal-speed muted/sound-on review. Official mark, UI/claim approval, voice rights, distribution channel, character finish and P3 projection quality remain open. Do not treat this preview as an approved master or start 1080p final rendering without picture and audio decisions.
