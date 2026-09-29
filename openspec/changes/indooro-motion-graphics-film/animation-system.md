# Animation system

Time is an integer frame at 30 fps. Scene components receive a local frame through `Sequence`; the main composition is exactly 1,950 frames. Every interpolation clamps at its endpoints. A common ease-out cubic produces measured acceleration; no CSS keyframe/transition runs outside Remotion's frame clock.

Standard tokens: text entrance 18 f, small UI entrance 12 f, route draw 45–70 f, camera move 60 f, boundary continuity window 12 f. Each scene reserves the first 15–25 f to inherit the prior motif and the final 15–25 f to prepare the next. Shared map geometry, phone frame, and mint line avoid disjoint visual cuts. Cinematic movement is simulated with transforms of 2D layers rather than a real 3D scene. The map graph is fixed data; A* and list tour calculations are deterministic. Animated SVG dash lengths are computed from path points and shared helpers.
