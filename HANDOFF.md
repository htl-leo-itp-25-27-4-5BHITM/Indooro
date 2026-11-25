# HANDOFF: polish-platform-consistency

Goal: make every Indooro platform polished, consistent and production-ready. OpenSpec change `polish-platform-consistency` (contracts and ownership in `openspec/changes/polish-platform-consistency/design.md`).

Orchestrator: this session, worktree `.claude/worktrees/polish-orch`, branch `chore/polish-orchestrator`.

## Packages

| Package | Session | Branch | Status |
|---|---|---|---|
| P0 OpenSpec change | orchestrator | `chore/polish-orchestrator` | PR open |
| P1 backend 201 + Location | polish-backend | `feat/rest-201-location` | running |
| P2 admin pages and tables | polish-admin-pages | `feat/admin-pages-polish` | running |
| P3 admin layout editor | polish-admin-editor | `feat/admin-editor-viewport` | running |
| P4 iOS sweep | polish-ios | `feat/ios-polish` | running |
| P5a pilot-showcase GUI polish | polish-showcase | `feat/showcase-polish` | running (task 6.1) |
| P5b legacy `app/` + android docs | polish-legacy-web | `feat/legacy-web-polish` | running (tasks 6.2, 6.3) |

## Decisions
- D1–D4 in design.md. Create = 201 + Location + empty body; upsert = 201/204 + Location; actions unchanged.
- Admin client is tolerant (body or Location) so deploy order does not matter.
- `android/` holds only planning docs; only stale API statements get fixed.
- P3 must not edit `admin-ui/src/style.css` (owned by P2).
- 2026-11-25: Erik asked for more parallel GUI polish; P5 split into P5a/P5b and started at once (6 workers, Haiku for P5b).
