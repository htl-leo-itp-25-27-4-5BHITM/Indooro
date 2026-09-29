# Indooro motion graphics — production report

## Delivered

- `indooro-motion-graphics-final.mp4`: 1920 × 1080 H.264, `yuv420p`, 30 fps, 1,950 video frames (65.000 s), AAC stereo.
- `indooro-motion-graphics-preview.mp4`: 960 × 540 H.264, `yuv420p`, 30 fps, 1,950 video frames, AAC stereo.
- `indooro-poster.png`: 1920 × 1080 closing composition.
- `indooro-storyboard.md`: final eight-scene storyboard.
- This report and the editable Remotion project in `../`.

The MP4 container duration is 65.045 s because AAC adds a short encoder tail; the video track itself is exactly 65.000 s. The final media probe reported H.264, `yuv420p`, 1920 × 1080, 30/1 fps, 1,950 frames, and AAC at 48 kHz. Remotion 4.0.530 packages were version-aligned.

## What was produced

Eight animated scenes tell the search-to-route story. A shared one-floor illustrative store graph supplies shelf obstacles and destinations. A* calculates the single-product path. The local-list example uses nearest-neighbour plus 2-opt over graph distances; the particular illustrated visit order goes from 59 to 31 grid steps. These are internal example distances, not a claim about measured shopping time or universal optimality. The current repository supports local shopping-list/tour concepts while the core MVP remains one-product map guidance.

The interface, store map, admin editor, and vector wordmark are concept art derived from project documentation, not screen captures or a real retailer layout. Detailed UI scenes and the closing screen carry `Konzeptdarstellung`. No SPAR branding, accuracy figure, or deployment claim appears. The score and effects are original procedural synthesis; Inter is bundled under SIL Open Font License 1.1 (`public/fonts/INTER-LICENSE.txt`).

## Verification

- OpenSpec 1.3.1 strict validation: 39 items passed, 0 failed, including the film change.
- Clean `npm ci`, ESLint, and TypeScript: passed. Two route tests: passed; all path cells are walkable and the illustrated tour improves. A poster smoke render passed after the clean install.
- Determinism: two separate renders of frame 810 produced identical SHA-256 hashes.
- Visual QA: inspected multiple stills across all eight scenes, three frames around each of seven scene boundaries, corrected a shopping-list text overlap and opening route dash discontinuity, then inspected updated stills. Encoded final frames at the list reveal and closing hold were also inspected.
- Audio source: 65 s stereo PCM WAV, peak −6.48 dBFS, RMS −21.46 dBFS before Remotion's 0.8 volume. Start and end half-second windows are both around −37 dBFS RMS, consistent with the planned fades.
- Actual final and preview MP4s were probed for dimensions, codecs, pixel format, audio, frame rate, and duration. Both contain 1,950 video frames.

## Review limits

This environment could inspect images, media metadata, and audio signal levels but could not audition audio or watch the entire file continuously in a media player. The browser blocked local-file playback. A human should listen to the final soundtrack and watch the full 65-second preview once for subjective mix and pacing. No optional 4K or 9:16 export was rendered.

The V1 OpenSpec audit additionally found two storyboard discrepancies: scene 05 animates a Manhattan-distance node wave rather than A*'s actual visited set, although the final route itself is computed by A*; scene 08's project credit resolves at local frame 95, so the fully settled ending lasts 85 frames rather than the planned 90. Tasks 6.5, 6.8, 8.2, and 9.1 remain open. Other scene-level differences are listed in `../../openspec/changes/indooro-motion-graphics-film/implementation-notes.md`.

The rendered MP4s, poster, generated WAV, and review stills are preserved locally but excluded from Git because they are reproducible binaries and Git LFS is unavailable in this checkout. The source, generator, OpenSpec documents, storyboard, report, and a SHA-256 export manifest are versioned. Anyone moving to a different machine must copy the binaries separately or rerender them.

## Reproduction

From the project directory: `npm ci`, `npm run audio`, `npm run lint`, `npm run routes:test`, then `npm run render:final`, `npm run render:preview`, and `npm run render:poster`.
