# Indooro — final planned storyboard

**Format:** 1920×1080, 30 fps. Eight contiguous half-open scene intervals total exactly 1,950 frames = 65.000 s. Each outgoing scene remains as a visual layer for 15 frames beyond its interval while the incoming scene fades in; these layers do not add to the master duration. All interface views are illustrative. No voice-over.

## 01 — Lost in the aisle | 00:00–00:06 | 6 s | frames 0–179

- **Purpose:** Establish that finding one product in an unfamiliar store can feel circuitous.
- **Seen/layout:** Near-black field; a central isometric-ish supermarket of thin shelf rectangles occupies the right 65%. A small amber dot starts at the lower-right entrance. Left headline zone is empty until 1.5 s.
- **Camera:** Slow overhead drift right-to-left, scale 1.08→1.0; map rotates 7°→3°.
- **Typography/text:** Off-white 78 px, left aligned: `Wo ist eigentlich …` then `die Milch?` with Milk in mint.
- **Objects/choreography:** Shelf rows draw in staggered sets. Amber search line wanders along corridor turns, doubles back once; route grows from 0 to complete over frames 45–145. A small question marker gently pulses at a shelf.
- **In/out:** Fade from black over 12 f. At 160 f amber line straightens, changes to mint, and sweeps to center for scene 2.
- **Audio:** Soft pad appears, two faint footstep-like ticks, tension swell at 5.5 s.
- **Implementation/assets/dependency:** Shared SVG map, route helper, text reveal; no external imagery. Establish the same route glyph used in scene 2.

## 02 — Indooro reveal | 00:06–00:13 | 7 s | frames 180–389

- **Purpose:** Name the solution and introduce the phone as primary visual anchor.
- **Seen/layout:** The inherited mint line forms a route pin at left, the `INDOORO` wordmark enters beside it. A large tilted dark phone occupies the right half over a soft teal pool.
- **Camera:** Push toward phone 1.0→1.08 over 150 f; phone rotates −7°→−3°, then faces viewer by the last 25 f.
- **Typography/text:** Wordmark 108 px; one supporting line 38 px: `Dein Weg durch den Supermarkt.`
- **Objects/choreography:** Line curls into icon, wordmark mask reveals, phone bezel and reflected highlight assemble, screen shows map with a single glowing route. Hold full identity 70 f.
- **In/out:** Route line enters from scene 1. The screen enlarges and takes over the frame at 370–390 f, yielding to scene 3 search screen.
- **Audio:** Low resolved chord on logo reveal, filtered whoosh into phone.
- **Implementation/assets/dependency:** Phone shell, vector glyph, title component; depends on scene 1 mint line direction.

## 03 — Find products | 00:13–00:23 | 10 s | frames 390–689

- **Purpose:** Show search → result → product location.
- **Seen/layout:** Phone centered-right at near-front angle with ample screen area; left headline `Finden statt suchen.` at 80 px. A tiny `Konzeptdarstellung` label sits below the phone.
- **Camera:** Slow 5% push while interface animates; no perspective motion during text input.
- **Typography/text:** Search `Milch`, result `Milch · Kühlregal`, small map destination label `Milch`.
- **Objects/choreography:** Search field focuses at 425 f; `Milch` types in four deliberate characters over 40 f; result card rises and holds; selection pulse at ~535 f; UI slides to map by 575 f; mint destination pin expands and route preview appears by 640 f.
- **In/out:** Phone screen from scene 2 lands in identical size/position. Destination pin grows to become scene 4's large map marker.
- **Audio:** One focused tap at selection, subtle card glide, transition swell.
- **Implementation/assets/dependency:** Phone and concept UI, search/list card, shared map. Depends on scene 2 phone geometry and scene 4 destination coordinates.

## 04 — Indoor positioning | 00:23–00:34 | 11 s | frames 690–1019

- **Purpose:** Explain beacon-assisted indoor position and a corridor-following map route without a performance claim.
- **Seen/layout:** Large top-down map on right 70%, headline left `Navigation. Auch indoor.`; two or three subtle beacon rings, customer Blue Dot, mint destination. Small labels `BLE`, `Map Matching` are optional but remain secondary.
- **Camera:** Map pulls out 1.18→1.0 and rotates to 0°; gentle 60 px horizontal pan across the route.
- **Typography/text:** Headline 76 px; concept label below map, no accuracy figure.
- **Objects/choreography:** Destination pin from scene 3 contracts into map. Beacon rings breathe at staggered phases; a low-opacity uncertain position cloud converges to a point on the corridor; dot moves along walkable path; route draws to milk access point over ~80 f. Hold complete route 55 f.
- **In/out:** Pin scale transition from phone. At exit, route nodes widen and expose the walkable network for scene 5.
- **Audio:** Three airy signal pings, a soft rising line as route draws.
- **Implementation/assets/dependency:** Fixed map geometry, beacon pulse, route path, map camera. Depends on scene 3 marker and scene 5 graph.

## 05 — Intelligent route | 00:34–00:43 | 9 s | frames 1020–1289

- **Purpose:** Make walkable path calculation intelligible.
- **Seen/layout:** Abstract map fills right; left `Der passende Weg.` and a small `A* · Wegfindung`. Entrance and milk access node are labeled; shelves remain solid obstacles.
- **Camera:** Near-overhead, modest scale 1.0→1.05 centered on selected corridor.
- **Typography/text:** Headline 78 px; technical label 26 px.
- **Objects/choreography:** Graph nodes/edges appear on corridors. Exploration spreads across candidate paths in muted teal for 60 f; unused edges dim. The actual A* route traces in bright mint and arrow head travels toward the product. Final route holds 45 f.
- **In/out:** Network grows from scene 4 route. At 1260 f the single destination blooms into four product points for scene 6.
- **Audio:** Fine rhythmic ticks during exploration, warm resolution when final route locks.
- **Implementation/assets/dependency:** Deterministic grid graph and A* output; depends on scene 4 map coordinates and scene 6 product positions.

## 06 — Local shopping list tour | 00:43–00:52 | 9 s | frames 1290–1559

- **Purpose:** Demonstrate a multi-stop local list example with visibly improved order.
- **Seen/layout:** A floating list card on the left with `Milch`, `Brot`, `Nudeln`, `Äpfel`; map remains right. Text switches from `Eine Liste.` to `Ein durchdachter Weg.` Small `Lokale Tour · Beispiel` label clarifies scope.
- **Camera:** Map tilts 4° while list rows reorder; then levels.
- **Typography/text:** Two 74 px claims in sequence; item labels 30 px.
- **Objects/choreography:** Product pins appear in list order. An amber route crosses store repeatedly for 55 f. The old rows and route withdraw over 15 f; the new order slides in from the right over 20 f and the shorter mint corridor route draws, then holds. A brief clean map beat separates the two orders so labels never overlap.
- **In/out:** Four points emerge from scene 5 destination. The optimized mint line straightens into the rectilinear admin map grid by 1545 f.
- **Audio:** Brief syncopated list ticks; one low satisfying route-resolve tone.
- **Implementation/assets/dependency:** Same graph distances, deterministic tour algorithm, list UI. Depends on scene 5 nodes and scene 7 grid orientation.

## 07 — Store management | 00:52–00:59 | 7 s | frames 1560–1769

- **Purpose:** Reveal a configurable system behind the mobile route.
- **Seen/layout:** Map lines become a desktop editor panel on right 75%. Left headline `Flexibel verwalten.`; visible sidebar `Layout`, `Produkte`, selected shelf inspector. `Konzeptdarstellung` below editor.
- **Camera:** Pull back 8% to reveal interface, then gentle 40 px pan.
- **Typography/text:** Headline 76 px; editor labels 24–28 px, minimal copy.
- **Objects/choreography:** One shelf highlights, inspector card slides in, product marker `Milch` attaches to shelf access point. A small `Speichern` state changes to a check. No CSV import claim is required.
- **In/out:** Rectilinear route from scene 6 becomes editor grid. At 1740 f panel recedes while the phone returns for final hero.
- **Audio:** One restrained select tick, airy withdrawal.
- **Implementation/assets/dependency:** SVG map editor concept, shared shelf component and phone. Depends on scene 6 geometry and scene 8 map/phone positions.

## 08 — Final hero | 00:59–01:05 | 6 s | frames 1770–1949

- **Purpose:** Leave the name and one memorable promise.
- **Seen/layout:** Dark field, luminous route map recedes behind a polished phone at right. Route glyph and `INDOORO` dominate left. Claim `Finde deinen Weg.` below. Tiny `HTL Leonding · Projekt` text may appear only if it does not compete with the mark.
- **Camera:** Phone settles from −4° to −2° and camera eases into final position by frame 1860, then holds for 90 f.
- **Typography/text:** Wordmark 112 px; claim 43 px; no other slogan.
- **Objects/choreography:** Phone enters from editor pullback, route in screen and background align, glyph draws once, wordmark fades/masks in, claim appears 12 f later. All motion resolves by 1860. Final frame is fully composed.
- **In/out:** Inherits editor map/phone. End has no cut; image holds while audio fades during final 2 s.
- **Audio:** Soft two-note identity at 1800–1840 f; pad decays cleanly.
- **Implementation/assets/dependency:** Reuse phone, logo glyph, route map; final still frame is poster source. Depends on all shared design tokens.
