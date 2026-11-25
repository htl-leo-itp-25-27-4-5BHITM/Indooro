# HANDOFF: polish-platform-consistency (final)

Goal: make every Indooro platform polished, consistent and production-ready. OpenSpec change `polish-platform-consistency` (archived at the end of this work; specs applied to `openspec/specs/`).

## Merged PRs

| Package | PR | What changed |
|---|---|---|
| P0 OpenSpec change | #228 | Proposal, design (contracts D1-D4, ownership), spec deltas, tasks |
| P1 Backend 201 + Location | #231 | Create POSTs answer `201 Created` + `Location` + empty body; upserts 201/204 + `Location`; GET for every target; tolerant admin client and legacy admin; OpenAPI, httpyac, backend tests |
| P2 Admin pages and tables | #232 | Store create lands on store detail; shared `DataTable`; unified buttons, German copy, loading/empty/error states |
| P2 follow-up | #236 | Codes and ids stay on one line in tables |
| P3 Layout editor | #234 | Editor fills the viewport; canvas and panels scroll internally |
| P4 iOS sweep | #235 | Truncation, Dynamic Type, safe-area, German copy; map labels, hint, subtitle, rounded clip |
| P5a Pilot showcase | #233 | Layout and copy at 375/768/1440 px |
| P5b Legacy web + Android docs | #229 | `app/` marked legacy (not deployed); Android contract doc updated |
| P6 Customer web + landing | #230 | Landing copy, focus, mobile spacing; customer map labels not clipped |
| P7 Admin responsive | #238 | 390/768 px layouts, menu instead of sidebar, single h1, compact beacon actions |
| P7 follow-up | #240 | Stacked card tables on phones |
| P8 Browser tests | #237 | Playwright suite green, polish contract assertions |
| P8 follow-up | #239 | CI jobs `admin-ui-browser` and `pilot-showcase-browser` (lint, typecheck, Playwright) |
| CI Maven retry | #241 | `build-and-push` retries Maven Central HTTP 429/503 (resolver retry + up to 3 reruns with `-U`) |
| Admin spec race | #242 | Exact create-button locators (empty-state "Ersten Beacon anlegen" made the locator ambiguous) |
| Showcase CI stability | #243 | Functional specs run with reduced motion; tour spotlight NaN rect fixed |

## Decisions
- D1: create = 201 + Location + empty body; upsert = 201 create / 204 update, both with Location; action endpoints unchanged.
- D2: clients read only path and query of `Location` (same-origin behind the proxy) and still accept a JSON body.
- Browser CI jobs pin `ubuntu-24.04` because Playwright 1.60 cannot install Chromium on Ubuntu 26.04.
- `app/**` is not deployed; served static web lives in `backend/.../META-INF/resources/`.

## Remaining limits
- iOS 26.2 simulator runtime is not installed on the dev Mac: `xcodebuild` build/test ran only in CI. iOS screenshots come from iOS 18.6 simulators (iPhone SE 3, iPhone 16 Pro).
- Not simulator-verified on iOS: AR, camera scanner, permission banner, upsell sheet, study mode, list transfer sheets. The 16 Pro map screenshot predates the final grid clip.
- The 201 + Location contract is not yet deployed to LeoCloud; admin web and backend should roll out together (the clients are tolerant, so order does not matter).
- Integration on main `3b8b5480`: admin-ui typecheck, lint, 260 unit tests, build green; Playwright 238/238 on rerun (first full run had one failure in `beacons.spec.ts:11`, which passed 3x in isolation and in the full rerun: root cause fixed in #242); pilot-showcase 166 tests and build green.
