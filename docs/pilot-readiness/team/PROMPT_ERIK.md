# Erik – Integration, Navigation-Fallbacks, Release, Partner

## Deine Aufgabe in einem Satz

Du sorgst dafür, dass die App auch ohne gute Ortung führt (Route ab Eingang/letztem Stopp, „Ich bin hier“, lesbare Regalangabe, Offline-Cache), integrierst den Admin-Neubau in den Pilot-Branch, mergst die Pull Requests der anderen und führst die ersten Gespräche mit Märkten.

- OpenSpec-Change: `openspec/changes/add-pilot-guided-tour-fallbacks/`
- Zusätzlich: `fix-ios-contract-and-spec-drift` 7.1–7.4, 8.1–8.4; Archivierung von `stabilize-ios-navigation-pipeline` nach dem Feldtest
- Branch: `pilot/erik-guided-tour`; Integrationsbranch `pilot/first-store` (nur du mergst dort)
- Menschliche Aufgaben: Betreuung, Markt „Posttraße“ klären, erste Gespräche, LeoCloud-Befehle (Backup, Rotation, Rollout) nach Anleitung von Person C, PR-Reviews.

## Vorbereitung

Der Worktree für `pilot/first-store` existiert bereits unter `~/Documents/htl/Indooro-pilot`. Für deine eigene Arbeit:

```bash
cd ~/Documents/htl/Indooro
git fetch origin
git worktree add --track -b pilot/erik-guided-tour ../Indooro-erik origin/pilot/erik-guided-tour
cd ../Indooro-erik
```

## Reihenfolge für dich

1. **Heute:** Admin-Agent zu Ende arbeiten lassen; danach `codex/admin-platform-rebuild` pushen (er ist lokal 4 Commits voraus).
2. **Woche 1:** Prompt unten in deinen Agenten (Abschnitte 1–5 der Change).
3. **Sobald Admin-Neubau fertig:** PR `codex/admin-platform-rebuild` → `main` mergen, dann Abschnitt 7 (Merge `main` → `pilot/first-store`), dann Person C für Phase 2 Bescheid geben.
4. **Laufend:** PRs der anderen reviewen und in `pilot/first-store` mergen; `STATUS.md` „Wartet auf Menschen“ abarbeiten.

## Prompt für deinen Agenten (Codex oder Claude Code, komplett einfügen)

```text
Du arbeitest autonom im Repository Indooro (HTL-Diplomarbeit, iOS-App für Indoor-Navigation im Supermarkt) im Worktree dieses Ordners auf Branch `pilot/erik-guided-tour`. Ziel ist der erste echte Supermarkt-Pilot. Der Pilot muss auch funktionieren, wenn die Bluetooth-Ortung ungenau ist oder fehlt.

LIES ZUERST:
1. docs/pilot-readiness/team/AGENT_RULES.md (verbindlich)
2. docs/pilot-readiness/03_PILOT_READINESS.md (Blocker K3–K5, Abschnitt 4.4)
3. docs/NAVIGATION_REVIEW.md Abschnitt F und openspec/changes/stabilize-ios-navigation-pipeline/design.md
4. openspec/config.yaml
5. openspec/changes/add-pilot-guided-tour-fallbacks/ (proposal, design, specs/**, tasks.md) – dein Auftrag
6. openspec/changes/fix-ios-contract-and-spec-drift/tasks.md Abschnitte 7 und 8
7. swift/indooro-EinkaeuferFinal/TESTING.md

AUFTRAG:
- Setze die Abschnitte 1–6 und 8 der tasks.md der Reihe nach um (Skill `openspec-apply-change`). Abschnitt 7 (Merge des Admin-Neubaus) NUR, wenn `git log origin/main` den Merge von codex/admin-platform-rebuild enthält; sonst überspringen und in STATUS.md vermerken.
- Kernlogik zuerst in NavigationSessionCore (plattformunabhängig, im SwiftPM-Paket testbar) mit Tests, danach UI.
- Keine neuen Filter, Schwellwerte oder Timer. Keine Änderungen an der Positionspipeline (gehört Person B) und nicht an Suche/Settings/Profil (gehört Person A). Dateibesitz: AGENT_RULES.md Abschnitt 5.
- Hake erledigte Tasks ab, auch die übernommenen in fix-ios-contract-and-spec-drift (7.1–7.4, 8.1–8.4) mit „(implemented in add-pilot-guided-tour-fallbacks)“.
- UI-Texte deutsch, wie in den Specs vorgegeben („Ich bin hier“, „Tippe auf deinen Standort“, „Route ab Eingang“, „Nicht im Testbereich – bitte Personal fragen“).

ARBEITSWEISE:
- Ein schreibender Agent. Für Lese-Recherche optional bis zu 2 Subagenten mit kleinerem Modell.
- Vor Beginn: `git fetch origin && git merge origin/pilot/first-store`; Baseline `swift test` (77 grün) und xcodebuild (Befehl in AGENT_RULES.md).
- Nach jedem Abschnitt: swift test + xcodebuild, commit mit Task-Nummer, git push.
- Simulatorprüfungen mit Screenshots unter docs/pilot-readiness/evidence/guided-tour/.

FERTIG, WENN:
- Abschnitte 1–6 und 8 erledigt (7 nur wenn möglich), swift test grün, BUILD SUCCEEDED, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` grün, Skill `openspec-verify-change` ausgeführt.
- Branch gepusht, PR `pilot/erik-guided-tour` → `pilot/first-store` vorbereitet.
- STATUS.md-Zeile „Erik“ aktualisiert. Zusammenfassung: fertig / rot / Mensch nötig.

Archiviere keine Change.
```

## Merge-Checkliste für `pilot/first-store`

Für jeden PR:

1. `git fetch origin && git checkout pilot/first-store && git merge --no-ff origin/<branch>` im Worktree `Indooro-pilot`.
2. `cd swift/indooro-EinkaeuferFinal && swift test`, xcodebuild, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
3. Bei Konflikten in fremden Dateien: Autor des PR fragen, nicht raten.
4. `git push origin pilot/first-store`, Team informieren („bitte origin/pilot/first-store mergen“).
