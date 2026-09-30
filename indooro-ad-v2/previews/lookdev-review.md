# V2 visual reset after rough-cut rejection

**Status: look development only. Not a replacement video or picture lock.** The user reviewed the first 26-second rough cut on 2026-09-30 and found the store empty, shopper motion unconvincing and textures unrealistic. That review rejects the current cut as a showable advertisement.

## What changed in this test

- The store now has open steel racks, five stocked levels, individually printed generic packs, scanned food cans, price rails, aisle signs, retail luminaires, a rear refrigerated wall and a real tiled PBR floor. Coat/fabric testing also uses image-based maps.
- A continuous skinned CC0 walk rig replaces detached animated body primitives in distant P1/P3/P6 tests. P5/P7 use route POV after the full-body angles proved too game-like. A separate Blender Studio CC0 hand mesh replaces the spherical product-reach hand.
- The destination camera crops out the mannequin body and emphasizes product/hand contact. The darker slate wall and lower ambient light keep the premium tech contrast without turning the market into a black void.
- The tests are isolated in `blender/scripts/render_lookdev.py` and `public/3d-passes/LOOKDEV-*`. The rejected rough-cut render script, source projections and MP4 are unchanged.

The local [three-frame contact sheet](lookdev-contact.png) samples aisle frame P1/22, distant navigation P6/40 and destination P4/114. Reproduce them with `blender -b --factory-startup --python blender/scripts/render_lookdev.py -- P1 22` and the corresponding P6/P4 commands. A separate 31-frame / 1.03-second [silent walk test](lookdev-walk-test.mp4) uses P6 frames 25–55 at 640×360 / 30 fps. It exposed a camera Euler wrap that sent the lens into a wall; yaw unwrapping fixed that error. The camera and route now stay visible through this interval. Several P3/P5/P7 stills test alternate viewpoints; P7's initial camera also aimed through a rack and was corrected. No complete film was rendered from this new look.

## Honest assessment

The environment reads as a supermarket now, and the product is identifiable. **It still does not meet a premium ad finish.** Scanned cans add variety, but most shelves still repeat too evenly. The 1.03-second motion sample confirms a coherent camera move; the shopper remains recognizably a game-like base model and its gait still needs foot-plant review at 720p. The sleeve/hand contact lacks a natural grasp, so the product close-up is not approved. The earlier map-to-store composite, provisional brand and scratch audio are also unresolved.

## Required next visual gate

1. Replace or substantially redesign the human asset and wardrobe, or change the navigation shots to first-person/partial-body framing. Do not use a full-body closeup of the current rig.
2. Extend the corrected moving aisle/character test to the full navigation beat at 720p normal speed, muted and with temporary sound. Stage a separate product contact test; do not infer grasp quality from the still.
3. If movement still looks artificial, commit to the first-person route framing and reserve human presence for phone/hand/brief wide scale shots. Keep the user-centered story explicit.
4. Improve product variety, shelf dressing, reflections, lighting, P3 screen-to-world alignment and brand asset before any full 26-second rerender.

The new look must pass a normal-speed human review before picture lock or final audio/master work resumes.
