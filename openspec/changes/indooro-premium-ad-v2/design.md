## Context

V1 is preserved at annotated tag `indooro-motion-v1-baseline` and remains an editable, 65-second Remotion explainer. Its reusable graph, vector UI and frame helpers live in `indooro-motion/`. The new film is a separate customer advertisement with real-world human action, German narration, and a 32-second shot-level structure. No footage, performer, narration or music rights are currently confirmed. Current iOS and product specs establish search/map/route concepts but do not justify numerical outcome or retailer claims.

## Goals / Non-Goals

**Goals:** Deliver an approved concept and a future production design for a legible physical-to-digital-to-physical customer story; keep V1 recoverable; make licensed media, voice, scene timing, previews, creative review and final technical checks traceable.

**Non-Goals:** This planning assignment does not create `indooro-ad-v2/`, copy source, shoot/generate footage, record/generate VO, buy services, modify the Indooro app, rerender V1 or implement V2. The eventual ad does not explain algorithms, shopping-list optimization, administration or measured accuracy.

## Decisions

1. **Narrative and duration.** Recommend concept A/C hybrid, “Der Weg wird sichtbar”: one person seeks milk, taps search, sees a route, chooses the aisle and finds the product. Seven beats total 32 seconds at proposed 30 fps/960 frames, with VO spoken for roughly 17–19 seconds and deliberate open spaces. Alternative performance montage is too dependent on diverse footage and obscures product causality; a fully mixed-reality approach raises tracking and continuity risk. See `creative/concept-exploration.md`.
2. **Physical production.** Prefer a small controlled local shoot with one actor, one authorized unbranded store-like location and practical phone/hand shots. Lock focal length, lighting and action continuity via shot list. Licensed stock is a fallback only if the same person/location and rights can be sustained; generated footage is a last resort because hands, packaging, screen edges and motion continuity are hard to control and rights must be reviewed. No location or release is currently secured.
3. **UI representation.** Use the current iOS app and spec as reference, then choose either approved screen capture or an on-screen `Konzeptdarstellung` composite. A large one-product search/result/map sequence uses the same milk target and access point. The route in physical space is a cinematic overlay, not a claim that the app renders AR guidance. Film copy avoids quantified performance or shop partnership.
4. **Project isolation.** After approval, create `indooro-ad-v2/` with its own pinned Remotion/React/TypeScript package, `src/shots/`, `src/ui/`, `src/map/`, `src/timeline/`, `public/footage/`, `public/audio/{voice,music,sfx}/`, and `exports/`. Copy/extract validated V1 easing, map graph and visual primitives with provenance comments/tests. Do not import live source paths from `indooro-motion/`; V1 remains independently renderable.
5. **Shot system.** A single timecode/cue data module at 30 fps maps shots, VO phrases, music accents and SFX. Remotion uses frame-local transforms and deterministic footage positions. The route line is the transition spine: phone map route expands through the screen edge, follows a shelf-line match cut and contracts into the product marker. Camera moves correspond to actor motion or app focus; no generic drifting. Real footage is stabilized/graded before compositing where needed.
6. **Audio-first edit.** Record a temporary authorized German read before locking shot durations, lay a sparse music sketch and location ambience, then refine cuts on breath/action beats. Maintain separate VO, music, location and effect stems. Prefer a real actor/voice artist for authenticity; licensed TTS is a fallback after license and voice permission review. The old 65-second score is not the new bed.
7. **Preview and delivery.** First render four 2–5 s prototypes at 1280×720/30 fps H.264, then an entire low-resolution rough cut with labeled temporary tracks. Review muted, then with sound. Only after rough-cut and refined-cut approval render a 1920×1080 H.264/AAC master and poster; validate frame count, text/route clarity, rights, loudness/peak, clean transitions and actual listening. User approval is required before starting production and again before final quality render.

## Risks / Trade-offs

- No authorized location/actor/brand lockup → obtain written permissions and fallback to a deliberately designed tabletop/aisle set or fully graphic film only after concept revision.
- Real and illustrated footage may look pasted together → storyboard matched lighting, lens direction, shadow and film grain; prototype the phone-to-aisle transition first.
- UI may suggest shipping AR or measured live positioning → overlay as cinematic visualization, use accurate screen states and concept labeling; claim review against current specs.
- German VO may feel artificial or crowd the cut → prioritize real read, keep lines short, allow breath; do not lock timing from synthetic text estimates alone.
- 32 seconds may be too fast for comprehension → half-resolution first-viewer test; allow 30–35 seconds if the actual read and legibility demand it, staying inside 25–40 seconds.
- Media rights/cost may change → record provenance and license before download/use; no purchase during planning.
- Full-resolution rendering can waste time → short prototypes, low-resolution complete cut, then final render after approvals.

## Migration Plan

No application or V1 migration. After explicit user approval: secure assets/releases, initialize V2 package, prototype key shots, create rough cut, revise, approve audio/final cut, then render and verify. Rollback is to discard/revise the isolated V2 project; the V1 tag and exports remain available. This OpenSpec change is not archived until any eventual production is verified.

## Open Questions

Confirm access to a shootable location and actor/release; choose actual app capture versus labeled illustrative UI; approve preferred VO script and voice source; approve final Indooro logo/wordmark; choose intended distribution channels and aspect ratios; approve an asset/audio budget. These are listed in `review/open-decisions.md` and do not authorize production now.
