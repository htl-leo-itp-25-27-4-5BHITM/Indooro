# Render plan

1. Lock Remotion versions, install packages, typecheck, inspect composition metadata.
2. Render one anchor still per scene and three frames around every boundary; inspect via contact sheet and individual images.
3. Render a low-resolution full preview (960×540, 30 fps) to check pacing and sound, then correct source.
4. Render `indooro-motion-graphics-final.mp4` at 1920×1080, 30 fps, H.264/yuv420p, AAC. Expected 1,950 frames and 65.000 s.
5. Render `indooro-poster.png` from a held closing frame. Copy the final storyboard and write a factual report.
6. Probe both MP4s for actual codecs, dimensions, frame rate, duration, audio; inspect opening/ending and transition samples from the encoded result.

Rendering is deterministic. The preview and main film share composition source. 4K and 9:16 are future compositions, not promised exports.
