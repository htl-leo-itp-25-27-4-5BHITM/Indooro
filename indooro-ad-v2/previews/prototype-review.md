# Indooro V2 — four draft prototype review

**Scope:** User approval covered P1–P4 only. These independent 1280×720, 30 fps drafts test the three signature moments plus the phone/search setup. They are not the 26-second film. Navigation shots 05–07, final voice/music, approved brand artwork and a final master do not exist.

## Outputs and objective checks

| Draft | Planned master range | Local file | Video frames | Technical check |
|---|---:|---|---:|---|
| P1 — chaos → direction | 0–119 / 0–4 s | `P1-opening.mp4` | 120 | H.264, 1280×720, 30 fps, AAC scratch cue |
| P2 — search for milk | 120–179 / 4–6 s | `P2-phone-search.mp4` | 60 | H.264, 1280×720, 30 fps, AAC scratch cue |
| P3 — enter the map | 180–299 / 6–10 s | `P3-enter-map.mp4` | 120 | H.264, 1280×720, 30 fps, AAC scratch cue |
| P4 — destination → brand | 540–779 / 18–26 s | `P4-destination-brand.mp4` | 240 | H.264, 1280×720, 30 fps, AAC scratch cue |

`ffprobe -count_frames` confirmed every listed video frame count, codec, resolution and frame rate. AAC encoder padding makes container duration approximately 0.04–0.05 s longer than picture; picture timing is exact. The shared layout validator passed: ten route points, four shelf footprints and milk access on a walkable route. `npm run lint` includes ESLint and TypeScript. The SHA-256 list is in `MANIFEST.sha256` and identifies the local review exports, which are generated and ignored by Git.

Independent Remotion still renders at P4 local frames 165 and 239 have identical SHA-256 hashes, confirming the source composition's final 75-frame static hold; decoded H.264 pixels may differ slightly because of interframe compression.

The original generated mono scratch cues are **internal timing references only**. They contain no stock samples, paid sounds, music master or voice clone. No German VO was generated because voice source and rights remain undecided. Decoded audio peaks are roughly −23 to −26 dBFS, with no detected clipping; these levels are not a final mix or a listening assessment.

## Sampled-frame findings and decisions to test at normal speed

| Draft | Sampled interval and visible result | Specific review risk |
|---|---|
| P1 | 0–2.3 s moves low between dark sculptural shelves, then cranes to a small shopper; 2.5–4 s introduces mint position cue and a selective light/vignette change. | The route problem and change in visual hierarchy may be too subtle. The shopper reads as a simple mannequin in the wide. Ask first-time viewers what changed at activation without explaining it. |
| P2 | 0–1 s holds the phone and types `Milch`; 1–2 s reveals one result and the map with a route. `Konzeptdarstellung` flags the illustrative UI. | Search is readable in sampled 720p frames, but UI wording and exact product/location information need current-app and brand approval. The phone is a 2D Remotion hero, not a final 3D object. |
| P3 | 0–2 s enlarges the same map/route; 2–4 s blends the vector floor plan into one uninterrupted Blender camera descent and the 3D store route. | This is a compositing proof, **not** the final corner-pinned screen/matte/extrusion contract. Map rectangles and shelf volumes are based on one layout, but their projected edges are not yet verified to a 2 px match. At normal speed the handoff may still read as a dissolve; if so, prototype the continuous 2.5D fallback or add camera projection/matte passes before proceeding. |
| P4 | 0–2.5 s follows the final aisle; around 2.5–4 s the route marker and narrow shelf connector identify the generic milk carton; around 3.3–4 s the shopper reaches. After 4 s the residual route moves into darkness and frames the provisional wordmark. The final composition is static for at least the planned 75 frames. | The arm is now physically connected during the reach but still visually stiff. The carton and thin connector may be easy to miss. The route-to-brand shape and `INDOORO` typography are provisional until an approved mark is supplied. |

Frames were sampled and contact sheets inspected; this is **not** a human continuous-playback or listening signoff. The technical outputs demonstrate that Remotion plus scripted Blender can produce all four intended draft sequences without footage or manual location work. They do not prove premium character finish, one-glance story clarity, exact P3 projection or a final sonic identity.

## Main build, fallback and boundary

- **Blender:** modular store, scripted camera motion, stylized shopper, product carton and 3D floor route for P1/P3/P4. Beauty PNGs are local generated artifacts. The P4 reach is a simple pose and needs art-direction review.
- **Remotion:** phone/search/map, graphic route continuity, activation and destination overlays, provisional brand line/type, scratch-cue placement and four standalone H.264 exports.
- **Fallback:** if P3 screen entry feels like a dissolve, use one Remotion virtual camera with the same map footprints, layered shelf cards, shopper silhouette and continuous route. P1 can reduce geometry while retaining the low-to-high reveal; P4 can crop to upper body/hand while keeping product and route marker in one composition. These fallbacks are specified, **not yet rendered**.
- **Rights and claims:** store, product and UI are illustrative. The brand end is labelled provisional. No footage, stock visual assets, external music or final voice were used. The spatial line is an editorial visualization, not a live AR or positioning-accuracy claim.

## Acceptance gate

Before any navigation or full-film work, watch each MP4 at normal speed **muted and with the temporary cue**, preferably on a laptop and phone. Record time-coded notes about P1 problem/activation, P2 search readability, P3 screen-entry continuity, P4 exact find/character reach and brand read. Resolve the official mark, UI/copy disclosure, voice authorization and channel requirements. The user must then explicitly accept the four prototypes or request revisions. Until that decision, OpenSpec task 4.6 and all full-production tasks remain unchecked.
