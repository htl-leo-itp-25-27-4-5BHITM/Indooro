# V2 concept and future production tasks

Checked tasks are verified planning/preservation work only. **No V2 implementation or render task is checked.** Each line names its expected result. Approval is a required external gate.

## 1. Preserve and audit V1

- [x] 1.1 Inspect Git, original OpenSpec, source, assets and reports; result: evidence and true initial repository state recorded in `docs/v1-production-history.md` and `research/existing-project-audit.md`.
- [x] 1.2 Commit genuine V1 source/delivery stages without generated binary media; result: readable existing/new commits and unchanged V1 assets.
- [x] 1.3 Verify V1 package and exports; result: lint/typecheck, two route tests, media probe and four SHA-256 manifest entries pass.
- [x] 1.4 Create V1 baseline tag and planning branch; result: `indooro-motion-v1-baseline` and `feature/indooro-ad-v2-concept` exist.
- [x] 1.5 Review encoded final stills, scene code and embedded-audio measurements; result: time-coded scene, audio and reuse reports, with no false claim of continuous viewing/listening.

## 2. Concept and OpenSpec planning

- [x] 2.1 Compare three distinct concepts; result: selected human-centered direction and documented alternatives.
- [x] 2.2 Define truthful 32 s customer story and visual system; result: proposal, visual direction and selected concept documents.
- [x] 2.3 Plan 16 timed shots with camera, action, graphics, VO, SFX, transition and assets; result: 960-frame storyboard and shoot list.
- [x] 2.4 Write three German VO scripts and audio-first music/mix plan; result: recommended script and cue/acceptance documents.
- [x] 2.5 Specify isolated architecture, reuse, rights, assets, risks and preview workflow; result: production documents and seven capability specs.
- [ ] 2.6 Validate OpenSpec strict, review links/timing/checklists and commit review package; result: complete, internally consistent proposal ready for approval.

## 3. User review and authorization

- [ ] 3.1 Present concept and trade-offs; result: user has the concise `review/concept-presentation.md` and can inspect detailed artifacts.
- [ ] 3.2 Obtain **explicit user approval** of selected concept, scope and production start; result: recorded approval before any V2 media/code work.
- [ ] 3.3 Resolve location/actor, UI capture/composite, brand, VO, distribution and budget decisions; result: approved production brief and rights plan.

## 4. V2 project setup — after approval

- [ ] 4.1 Initialize isolated `indooro-ad-v2/` Remotion package and exact frame/cue map; result: clean install and composition metadata pass without touching V1.
- [ ] 4.2 Extract only selected V1 helpers/graph with provenance and relevant tests; result: isolated deterministic helpers and walkable route verification.
- [ ] 4.3 Create media manifest and rights ledger; result: every imported asset has an owner, license/release and checksum.

## 5. Key-shot prototypes — after approval

- [ ] 5.1 Prototype physical hook and customer phone action in 720p short ranges; result: recognizable person/product need and readable phone action.
- [ ] 5.2 Prototype phone-map-to-aisle route transition; result: reviewed geometry, lighting, occlusion and screen direction.
- [ ] 5.3 Prototype route-to-product reach and final brand card; result: coherent physical payoff and approved 2 s identity hold.
- [ ] 5.4 Obtain creative review of prototypes; result: written time-coded accept/revise decisions before full scene build.

## 6. Audio development — after approval

- [ ] 6.1 Record authorized scratch German VO and time its actual phrases; result: approved timing map with natural pauses.
- [ ] 6.2 Compose or license a purpose-built temporary music cue and capture location/foley; result: cleared, labeled separate preview stems.
- [ ] 6.3 Design sparse UI/route/logo effects; result: cue sheet synchronized to meaningful visual actions.

## 7. Complete low-resolution preview — after approval

- [ ] 7.1 Assemble all 16 shots with consistent actor/product/map continuity; result: 32 s rough cut or justified 25–40 s revision.
- [ ] 7.2 Export 1280×720 H.264 preview with temporary audio labels; result: reviewable file and matching timecode/cue sheet.
- [ ] 7.3 Run first-viewer, muted and sound-on reviews; result: documented comprehension and pacing feedback.

## 8. Creative revisions and picture lock — after approval

- [ ] 8.1 Revise weak/unclear shots and VO pacing; result: refined preview addressing time-coded feedback.
- [ ] 8.2 Verify search/result/map truth and illustrative labels; result: claim review against current iOS/spec evidence.
- [ ] 8.3 Obtain explicit refined-cut/picture-lock approval; result: stable shot and frame durations for final media.

## 9. Final picture and audio — after approval

- [ ] 9.1 Finish approved footage grade, screen composites, route overlays and typography; result: final-quality frames without tracking or legibility failures.
- [ ] 9.2 Record/approve final German voice, clear final music/SFX, mix stems; result: human-approved intelligible mix and asset rights ledger.
- [ ] 9.3 Listen on headphones, laptop and phone and run loudness/true-peak/silence checks; result: documented creative and technical audio acceptance.

## 10. Final render and delivery — after approval

- [ ] 10.1 Obtain explicit final-render approval; result: authorized 1080p master render.
- [ ] 10.2 Render H.264/yuv420p 30 fps with AAC and poster; result: reproducible outputs and hash manifest.
- [ ] 10.3 Inspect encoded scene boundaries, sample frames, full film muted/with sound, stream properties and rights; result: signed-off QA report.
- [ ] 10.4 Deliver approved film/source and archive change only after verified acceptance; result: reviewable final assets and truthful OpenSpec state.
