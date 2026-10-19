# Release-Protokoll Backend

Eine Zeile pro Rollout oder Rollback, neueste unten. Ablauf: `RELEASE_RUNBOOK.md`. Keine Secret-Werte eintragen.

| Datum (UTC) | Art | Commit | Image-Tag / Digest | Angewendete Manifeste | Backup-Datei | Smoke-Check | Vorheriger Stand | Person | Bemerkung |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | Rollout | `a47c5e6` | `:a47c5e6` / `sha256:b00e3a51…f6cae6` | – (`kubectl set image`) | `indooro-2026-10-17-before-release-a47c5e6.dump` (außerhalb des Repos) | ok: 4 Stores, 153 Produkte, Suche 200, Admin 302 | `:248091e` / `sha256:61a793ea…df1464` | Erik / Claude Code | Release #120, Details `docs/pilot-readiness/releases/RELEASE_2026-10-17.md` |
| 2026-10-18 | Rollout | `ed845e3` | `:ed845e3` | – (`kubectl set image`, `set env`) | `2026-10-18-indooro.dump` (außerhalb des Repos) | 14 OK, 4 FAIL (`/api/admin/*` 302 statt 401) | `:a47c5e6` | Erik / Claude Code | Release #162, V16–V18; Katalog-Migration und Reindex nicht ausgeführt; Demo-Admin vorübergehend reaktiviert; Details `docs/pilot-readiness/releases/RELEASE_2026-10-18.md` |
