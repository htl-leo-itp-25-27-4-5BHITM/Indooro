# Sprint 2 (#195) – Stand der Vorbereitung

Story #195: Indoor-Navigation im Testraum `SPAR-Leonding-002` unter echten Bedingungen messen und auswerten.
Diese Datei ist das Arbeitsgedächtnis der Orchestrierung. Stand: 2026-11-19.

## Ausgangslage (geprüft 2026-11-19)

- main: `efea11b` (#220). Live-Image laut Release-Doku `308cd08`, keine neue Flyway-Migration.
- Offener PR #218 (iOS-Architektur): CI grün, MERGEABLE. Enthält `ShadowPositioning`, aber der Shadow-Modus schreibt nur eine Logzeile, nicht in die Aufnahme. Aktivierung nur per Info.plist-Key oder Env-Var `INDOORO_SHADOW_POSITIONING=1` (DEBUG).
- Testraum live (öffentliches Layout, Raster 5x9, 8 Regale, 4 Beacons, **kein Eingang**):

  | Name | UUID-Ende | Major/Minor | Zelle | Problem |
  |---|---|---|---|---|
  | Indooro1 | …1c16 | 1/1 | (5,9) | Major/Minor gleich wie Indooro4 |
  | Indooro2 | …1c11 | 1/2 | (5,0) | – |
  | Indooro3 | …1c15 | fehlt | (0,0) | Major/Minor fehlen |
  | Indooro4 | …1c17 | 1/1 | (0,9) | UUID nicht in `beacon-identities` |

- `beacon-identities` liefert nur UUIDs (…1c11, …1c13, …1c14, …1c15, …1c16 und Null-UUID).
- Tests unter `scripts/field/test_*.py` laufen in keiner CI.

## Arbeitspakete

| Paket | Inhalt | Ausführung | Branch / PR | Status | Blocker |
|---|---|---|---|---|---|
| A | Review #218, Merge-Entscheidung | Opus-Review-Agent | #218 | Review läuft | Erik-OK nötig |
| B | Debug-Build Messtag (Shadow in Aufnahme, Beacon-Liste, Schalter, `APP_AUFS_IPHONE.md`) | – | – | wartet | Entscheidung #218 |
| C | `check_testroom_beacons.sh`, Werte-Vorlage, Admin-Anleitung, Codex-Prompt | Sonnet-Agent | `field/beacon-check` | in Arbeit | – |
| D | `MESSTAG.md`, Checkliste, Marker-Generator, Doku zusammenlegen | Sonnet-Agent | `docs/messtag` | Entwurf in Arbeit | Platzhalter für B |
| E | `evaluate_field_day.sh`, synthetische Generalprobe, CI `field-tools.yaml` | Sonnet-Agent | `field/evaluate-field-day` | in Arbeit | Shadow-Anbindung nach B |
| F | JaCoCo-Artefakt, Tests Error-Logs | – | – | optional | A–E fertig |

## Merge-Reihenfolge

C → E → D (Entwurf) · #218 → B → E-Nachtrag (Shadow) → D final.
Branches werden per Merge von main aktualisiert, nie per Rebase mit Force-Push.

## Offene Entscheidungen für das Team

- #218 mergen (Erik).
- Toleranzen in `POSITIONING_DECISION.md` bestätigen (Team).
