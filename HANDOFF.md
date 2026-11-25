# HANDOFF: polish-platform-consistency

Goal: make every Indooro platform polished, consistent and production-ready. OpenSpec change `polish-platform-consistency` (contracts and ownership in `openspec/changes/polish-platform-consistency/design.md`).

Orchestrator: this session, worktree `.claude/worktrees/polish-orch`, branch `chore/polish-orchestrator`.

## Packages

| Package | Session | Branch | Status |
|---|---|---|---|
| P0 OpenSpec change | orchestrator | `chore/polish-orchestrator` | PR open |
| P1 backend 201 + Location | polish-backend | `feat/rest-201-location` | pending |
| P2 admin pages and tables | polish-admin-pages | `feat/admin-pages-polish` | pending |
| P3 admin layout editor | polish-admin-editor | `feat/admin-editor-viewport` | pending |
| P4 iOS sweep | polish-ios | `feat/ios-polish` | pending |
| P5 web clients sweep | polish-web | `feat/web-clients-polish` | queued (starts when a slot frees) |

## Decisions
- D1–D4 in design.md. Create = 201 + Location + empty body; upsert = 201/204 + Location; actions unchanged.
- Admin client is tolerant (body or Location) so deploy order does not matter.
- `android/` holds only planning docs; only stale API statements get fixed.
- P3 must not edit `admin-ui/src/style.css` (owned by P2).
