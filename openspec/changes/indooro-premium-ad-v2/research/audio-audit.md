# V1 audio audit

Source: `indooro-motion/scripts/generate-audio.mjs` synthesizes `public/audio/indooro-original-score.wav`; `src/Film.tsx` adds it as one `Audio` layer at volume 0.8. No spoken track, licensed song, or separate recorded SFX file is present. The encoded final MP4 has stereo AAC at 48 kHz. The original WAV is ignored by Git but hash-checked in the manifest.

## Objective checks, 2026-09-29

FFmpeg loudnorm analysis of the **embedded final mix** measured integrated loudness **−21.83 LUFS**, true peak **−8.39 dBTP**, and loudness range **1.30 LU**. The latter is very narrow; this is a measurement of the waveform, not a judgment that the music is bad. `silencedetect` at −50 dBFS for ≥0.4 s reported no unintended digital-silence gap. The earlier production report records source-WAV peak −6.48 dBFS, RMS −21.46 dBFS, and low start/end windows. No clipping is indicated by the measured peak. The MP4 includes an approximately 0.045 s AAC container tail beyond the 65.000 s image track.

## Creative assessment and limit

The film has no narration, so the music must carry pacing while dense on-screen text carries meaning. Source and frame timing show one continuous procedural bed rather than a voice-led arc or a library of distinct location/hand/interface sounds. The audio architecture offers limited room for spatial perspective and human presence. These are source-structure observations. **The sound was not auditioned**: this environment can inspect files and signal levels, but audio content returned through tools is not playable to the model. Therefore timbre, repetition, tonal balance, distortion by ear, emotional energy, actual synchronization and ending quality require a listening session before V1's mix can be finally judged. Do not infer musical quality from LUFS alone.

## V2 decision

Do not reuse the V1 soundtrack as the V2 bed. It was composed for 65 s without VO and its uniformity does not fit the selected 26 s shopper/route/brand arc. Keep the synthesis script as a reference for original UI tones only after audition and redesign. Develop a new score around the chosen VO and visible digital actions; create independent stems for VO, music, restrained interface and movement effects, and the brand signature. A store ambience is optional only if it improves the stylized setting; no location recording is required. At rough-cut stage, a human must audition the mix on headphones, laptop speakers and phone, alongside objective loudness and true-peak checks. No new V2 audio is generated in this planning change.
