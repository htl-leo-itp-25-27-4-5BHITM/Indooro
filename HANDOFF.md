# HANDOFF: polish-platform-consistency

Goal: make every Indooro platform polished, consistent and production-ready. OpenSpec change `polish-platform-consistency` (contracts and ownership in `openspec/changes/polish-platform-consistency/design.md`).

Orchestrator: this session, worktree `.claude/worktrees/polish-orch`, branch `chore/polish-orchestrator`.

## Packages

| Package | Session | Branch | Status |
|---|---|---|---|
| P0 OpenSpec change | orchestrator | `chore/polish-orchestrator` | merged #228 |
| P1 backend 201 + Location | polish-backend | `feat/rest-201-location` | PR #231, review OK, waits for CI `swift-tests` |
| P2 admin pages and tables | polish-admin-pages | `feat/admin-pages-polish` | merged #232; follow-up for beacons code column requested |
| P3 admin layout editor | polish-admin-editor | `feat/admin-editor-viewport` | merged #234 |
| P4 iOS sweep | polish-ios | `feat/ios-polish` | PR #235; map fixes not visually verified (simulator access needs user) |
| P5a pilot-showcase | polish-showcase | `feat/showcase-polish` | merged #233 |
| P5b legacy `app/` + android docs | polish-legacy-web | legacy-web-polish | merged #229 |
| P6 customer web + landing | subagent | `feat/customer-web-polish` | merged #230 |

## Decisions
- D1–D4 in design.md. Create = 201 + Location + empty body; upsert = 201/204 + Location; actions unchanged.
- Admin client is tolerant (body or Location) so deploy order does not matter.
- `android/` holds only planning docs; only stale API statements get fixed.
- P3 must not edit `admin-ui/src/style.css` (owned by P2).
- 2026-11-25: Erik asked for more parallel GUI polish; P5 split into P5a/P5b and started at once (6 workers, Haiku for P5b).
- P5b found `app/**` is not deployed; served static web lives in `backend/.../META-INF/resources/` (landing, customer/, legacy admin/). New package P6 owns that folder; P1 told not to touch it. Session start refused from an event turn, so P6 runs as a worktree subagent.
- #230 dropped its legacy admin create helper; #231 owns it (path-only Location read).
- iOS 26.2 runtime not installed locally; iOS build/tests verified by CI only.
- Integration on main after #232/#233/#234: admin-ui typecheck, lint, 257 unit tests, build green.
