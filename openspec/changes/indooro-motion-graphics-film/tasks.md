# Production tasks

Each checked item requires its stated result and verification. Checkboxes are updated only after work is complete.

## 1. Discovery and requirements

- [x] 1.1 Inspect repository README, current OpenSpec specs, canonical iOS app, admin materials, and logos; record source truth in asset inventory. Verify each cited path exists.
- [x] 1.2 Resolve conflicting positioning claims by omitting numeric accuracy; document local-list and illustrative-UI scope. Verify proposal/design/storyboard agree.
- [x] 1.3 Check and install official Remotion skills, read creation/markup/render guidance, and inspect available tools. Verify installed skill files and tool versions.

## 2. Creative concept and storyboard

- [x] 2.1 Define route-line concept, palette, type, lighting, composition, and sound in creative direction. Verify rules can be implemented from tokens.
- [x] 2.2 Author all eight storyboard scenes with exact frame boundaries, choreography, camera, typography, audio, transitions, assets, and dependencies. Verify durations sum to 1,950 frames.
- [x] 2.3 Validate proposal, six capability specs, design, and storyboard with OpenSpec strict validation. Fix any contradictions before code.

## 3. Production architecture

- [x] 3.1 Scaffold isolated Remotion/React/TypeScript project with pinned dependencies. Verify `npm install` and typecheck.
- [x] 3.2 Register main, scene, and poster compositions with 30 fps and correct duration. Verify composition metadata.
- [x] 3.3 Add `AGENTS.md`, `rules.md`, README, scripts, and asset folders. Verify commands and conventions are accurate.

## 4. Design system and assets

- [x] 4.1 Bundle licensed font or documented fallback and create color/type/spacing tokens. Verify glyph rendering.
- [x] 4.2 Build reusable map geometry, obstacles, graph, product locations, and route calculations. Verify route avoids shelves and local tour example is shorter.
- [x] 4.3 Build phone shell, UI cards, vector wordmark, route glyph, marker, and background layers. Render foundation stills and inspect.

## 5. Reusable motion components

- [x] 5.1 Implement deterministic easing, text reveal, path drawing, marker pulse, and camera helpers. Verify repeated frame rendering is stable.
- [x] 5.2 Implement fixed scene timing and continuity layers with no frame-count loss. Verify boundaries around all seven scene cuts.

## 6. Individual scenes

- [x] 6.1 Build opening problem scene; inspect first, middle, and end stills against storyboard.
- [x] 6.2 Build identity and phone reveal; inspect wordmark hold and screen transition.
- [x] 6.3 Build search interaction; inspect search/result/map states and concept label.
- [x] 6.4 Build positioning scene; inspect corridor-snapped position and beacon restraint.
- [ ] 6.5 Build A* explanation; inspect explored paths and true final route. The final route is calculated by A*, but the displayed node wave is based on Manhattan distance from the entrance rather than A*'s actual explored set.
- [x] 6.6 Build local list/tour scene; inspect item order, route comparison, and label.
- [x] 6.7 Build admin editor concept; inspect legibility and product assignment.
- [ ] 6.8 Build closing hero; inspect final 90-frame hold and poster frame. The hero and poster exist, but the footer resolves at local frame 95, leaving 85 fully settled frames rather than the planned 90.

## 7. Timeline and transitions

- [x] 7.1 Assemble eight scenes into exact 65-second timeline. Verify no gaps/overlays alter 1,950-frame count.
- [x] 7.2 Inspect adjacent frames around each transition and correct jumps, blank frames, clipping, or premature text exits.

## 8. Audio production

- [x] 8.1 Generate original music/SFX, record synthesis method, and add frame-aligned audio. Verify legal origin and timing.
- [ ] 8.2 Listen to beginning, middle, ending; check peak level and fade. Correct any audible abruptness.

## 9. Rendering

- [ ] 9.1 Render targeted scene stills and preview MP4. Inspect contact sheet, muted story, and pacing.
- [x] 9.2 Render Full HD H.264/yuv420p/AAC final MP4 and poster PNG. Verify files exist and open.

## 10. Quality assurance and correction

- [x] 10.1 Run typecheck, route validation, OpenSpec strict validation, and full media probe. Record actual outputs.
- [x] 10.2 Check on-screen claims against current project specifications, then fix unsupported wording.
- [x] 10.3 Review final encoded frames for type, contrast, phone, route, map, continuity, and final hold; correct identifiable defects.

## 11. Delivery

- [x] 11.1 Copy final storyboard to `indooro-storyboard.md` and write production report with pass/fail evidence and limitations.
- [x] 11.2 Verify all five named deliverables plus editable source and README, then present links.

## Pending subjective review

Items 8.2 and 9.1 remain open because this environment could not audition the soundtrack or play the 65-second MP4 continuously. Items 6.5 and 6.8 are open after the V1 code audit: the computed final path is genuine A*, while the exploration visualization is illustrative; the final hero holds completely settled for 85 frames. Signal levels, fade envelopes, timing, rendered frames, transitions, and media metadata were checked; the production report records the limits.
