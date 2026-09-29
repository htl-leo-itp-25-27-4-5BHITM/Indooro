## Context

V1 is preserved at `indooro-motion-v1-baseline`. Its 65-second Remotion film has a tested illustrative walkable route, editable vector map/phone, deterministic helpers and a coherent palette, but no visible user. The earlier V2 plan chose a 32-second live-action shoot; the approved creative constraint now requires a **fully AI-producible, motion-graphics-first advertisement**. The current host has V1 Remotion installed but no Blender executable in `PATH`; Cinema 4D is visible as an installed app. Tool availability must be checked after approval, while the plan remains executable through Remotion alone if Blender is unavailable.

## Goals / Non-Goals

**Goals:** A 28-second premium customer ad with one readable stylized shopper, a hero phone, search-to-route causality, a modular store, a product payoff, short German VO, original/cleared sound, isolated deterministic production and staged review.

**Non-Goals:** This planning assignment does not create a V2 package, 3D scene, prototype, render or audio. The eventual film requires no photographed actor, location, stock footage, photoreal human rig, C4D project or remote video-generation service. It does not explain A*, lists, admin features or accuracy figures.

## Decisions

1. **Concept and timing.** “Der Weg wird sichtbar” becomes a 28-second/840-frame, 30 fps motion-design ad: uncertainty 0–3 s, phone/search 3–8 s, route ignition 8–13 s, guided movement 13–21 s, product discovery 21–24 s, identity 24–28 s. At a provisional 120 BPM this is fourteen 4/4 bars. The actual natural VO read and 720p first-viewer check may justify 26–30 seconds, with exact frames updated before production.
2. **Shopper design.** Use one adult-proportioned faceless graphite figure with a simple head/torso/limb silhouette, restrained bevels and mint rim light. Model/animate with primitive geometry and parented transforms only; use 3/4, rear and overhead views, no face, fingers, cloth, mocap or detailed walk rig. A phone slab rises from the figure; the following UI close-up uses an abstract touch pulse, then the same figure turns, follows the route and reaches a simplified milk carton. The character is recognizable across six shots without becoming a mascot.
3. **Production options.** Option A, Remotion-only SVG/CSS/2.5D, is entirely feasible and the fallback, but has limited cinematic depth. **Option B, Remotion + Blender, is preferred:** Blender Python generates a small modular store, simple shopper, phone body and two or three short camera/hero passes; Remotion owns UI, route graphic handoff, edit, type, VO, SFX and export. Option C adds Cinema 4D or services but creates an unnecessary manual/proprietary dependency, so it is rejected. No crucial story beat depends solely on Blender output.
4. **Shared geometry and transition.** After approval, create one V2 illustrative `store-layout.json` consumed by the TypeScript route logic and a Blender Python builder. The walkable route ends beside, never inside, the target shelf. For the phone-to-store transition, Remotion animates a 2D path to the frame edge and cuts on matched tangent/position to a pre-rendered 3D route in the same coordinate system. This avoids fragile per-frame tracking. The route is a cinematic metaphor, not a claim that the app ships AR navigation.
5. **Render architecture.** `indooro-ad-v2/` is a standalone pinned Remotion project after approval. Blender renders only selected short passes as frame-numbered images (opaque environment, alpha hero where needed); Remotion composites them with vector UI, typography and audio. Blender scenes are script-generated and versioned, with deterministic seeds and fixed camera paths. A Remotion-only 2.5D composition must be able to replace those passes without changing narrative/cues. [Blender's official manual](https://docs.blender.org/manual/en/5.1/advanced/command_line/render.html) documents background rendering; [Remotion's media docs](https://www.remotion.dev/docs/media/video) document timeline integration. Do not install or render during planning.
6. **Audio-first timing.** Work from a short authorized scratch German read after approval, with separate VO, music and designed SFX stems. The score develops from low pulse to route impact and rhythm, then falls away at discovery and resolves with a two-note sonic mark. V1's 65-second no-VO score is not used as the new bed. Human listening, not waveform measurements alone, is mandatory.
7. **Preview and delivery.** Prototype problem/figure, phone interaction, route handoff and product/brand in 1280×720 short ranges. Review a full low-resolution rough cut before final-quality 1920×1080 H.264/AAC. Check 840-frame timing if 28 s remains final, route geometry, first-viewer comprehension, text/figure legibility, rights, soundtrack quality and stream metrics. Further rough-cut/picture-lock/final-render gates follow initial concept approval.

## Risks / Trade-offs

- Simplified human feels generic or cartoonish → adult proportions, no facial features or bounce, clear need/turn/reach choreography and premium light/material tests in first prototype.
- Blender is unavailable on the current host → preflight after approval; use documented Remotion-only SVG/2.5D store and figure path if installation or automation is impractical.
- 3D passes and UI lose continuity → one shared map, palette, camera direction and route handoff; render short still/sequence tests before full shots.
- 28 seconds is too compressed → test at 720p; extend result/route/discovery holds within 25–30 s instead of adding feature chapters.
- Route appears to claim in-app AR → describe it as editorial visualization, keep actual UI states distinct, and review product claims against repo specs.
- Synthetic narration or procedural effects sound cheap → audition multiple authorized takes, keep phrases short and mix sparse stems on real devices.
- Render cost grows → only selected Blender shots, preview frames first, cache intermediates with hashes and preserve the Remotion fallback.

## Migration Plan

No app or V1 migration. After **explicit approval**, preflight tools/brand/voice rights, initialize isolated V2, prototype key shots, review rough cut, refine audio/picture, obtain final-render approval, then export and verify. Rollback means revising/removing isolated V2 work; V1 tag and local exports stay intact. Do not archive this change before actual verified delivery.

## Open Questions

Approval of this revised concept; final brand mark; precise app UI source/illustrative label; German VO source and rights; delivery channels/aspect ratios; spending cap for optional audio/software/assets. Actor, store-location and live-footage access are **not** open dependencies.
