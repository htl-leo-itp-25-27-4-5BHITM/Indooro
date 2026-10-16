# Erik (Mac) – Admin-Abschluss, Integration, Navigation, Mess-Replay, Partner

## Reihenfolge für dich (Mensch)

1. **Heute:** dem laufenden Admin-Agenten [PROMPT_ADMIN_AGENT.md](PROMPT_ADMIN_AGENT.md) schicken („Pilot-Cut“).
2. **Heute:** die drei Prompts verschicken (siehe [SEND_LIST.md](SEND_LIST.md)) und die Namenszuordnung A/B/C festlegen.
3. **Diese Woche:** deinen eigenen Agenten mit dem Prompt unten starten.
4. **Sobald der Admin-PR bereit ist:** Backup, Admin-PR nach `main` mergen, Rollout mit Smoke-Check, Team informieren. Dann merged dein Agent `main` in `pilot/first-store` (Change 1, Abschnitt 7).
5. **Laufend:** PRs der anderen prüfen und in `pilot/first-store` mergen. „Wartet auf Menschen“ in `STATUS.md` abarbeiten: Betreuung, Budget, Markt „Posttraße“ klären, LeoCloud-Befehle, DEBUG-Builds aufs Mess-iPhone, erste Gespräche mit Märkten.

## Arbeitsordner

```bash
cd ~/Documents/htl/Indooro
git fetch origin
git worktree add ../Indooro-erik pilot/erik-guided-tour    # lokaler Branch existiert schon und folgt origin
cd ../Indooro-erik
```

Für die Mess-Replay-Aufgaben später im selben Ordner: `git switch --track origin/pilot/field-replay`.

## Prompt (komplett in deinen Agenten einfügen)

```text
Du arbeitest autonom im Repository Indooro (HTL-Diplomarbeit: SwiftUI-iOS-App für Indoor-Navigation im Supermarkt mit BLE-iBeacons). Ziel ist der erste echte Supermarkt-Pilot. Die App muss auch funktionieren, wenn die Bluetooth-Ortung ungenau ist oder fehlt. Du bist der Agent von Erik (Navigation und Integration, macOS mit Xcode).

LIES ZUERST:
1. docs/pilot-readiness/team/AGENT_RULES.md – verbindlich
2. docs/pilot-readiness/team/ROADMAP.md, docs/pilot-readiness/03_PILOT_READINESS.md (Blocker K3–K5, Abschnitt 4.4)
3. docs/NAVIGATION_REVIEW.md Abschnitt F und openspec/changes/stabilize-ios-navigation-pipeline/design.md
4. openspec/config.yaml
5. swift/indooro-EinkaeuferFinal/TESTING.md und NavigationFixtures/BASELINE.md

DEINE CHANGES, IN DIESER REIHENFOLGE:
A) openspec/changes/add-pilot-guided-tour-fallbacks/   Branch pilot/erik-guided-tour
   - Abschnitte 1–6, 9, 10 und 8. Abschnitt 7 (main → pilot/first-store) NUR wenn `git log origin/main` den Merge von codex/admin-platform-rebuild enthält; dann in diesem Fall auf Branch pilot/first-store arbeiten, Konflikte laut design.md Entscheidung 7 lösen, Prüfungen, push.
   - Übernimmt fix-ios-contract-and-spec-drift 7.1–7.4, 8.1–8.4, 9.1–9.3 – dort abhaken mit „(implemented in add-pilot-guided-tour-fallbacks)“.
B) openspec/changes/add-ios-app-test-target/  Branch pilot/ios-test-target
   - Task 1.2 (Test-Target in der Xcode-Oberfläche anlegen, 5 min) ist ein Human step für Erik: falls das Target fehlt, Blocker eintragen und zuerst die Fixtures (Abschnitt 2) erstellen.
   - Übernimmt fix-ios-contract-and-spec-drift 1.3.
C) openspec/changes/establish-pilot-field-measurement/  Branch pilot/field-replay – NUR Tasks mit [E]. Tasks mit [C] gehören Person C. Aufnahmen kommen über NavigationFixtures/incoming/ (gitignored); fehlen sie, die Tasks als „wartet auf Messung (Person C)“ eintragen und nur die vorbereitenden [E]-Tasks (1.2, 3.3 sobald layout-testraum.json da ist, 4.3, 6.1) erledigen.
D) openspec/changes/add-store-pilot-readiness-check/  Branch pilot/store-readiness – NUR nach dem Admin-Merge in main: `git switch -c pilot/store-readiness origin/main`, Change-Ordner übernehmen (`git checkout origin/pilot/first-store -- openspec/changes/add-store-pilot-readiness-check docs/pilot-readiness/team`), committen, umsetzen. Backend-Tests mit `sh ./mvnw test` (mvnw hat kein Execute-Bit). Pull Request nach main. Fasse dabei nur die neuen Readiness-Dateien und die nötigen Routen an; der Rest von backend/** gehört Person B.

ABLAUF JE CHANGE:
1. `git fetch origin`, Branch wechseln, `git merge origin/pilot/first-store`.
2. Baseline: `cd swift/indooro-EinkaeuferFinal && swift test` (77 grün) und xcodebuild (Befehl in AGENT_RULES.md).
3. Tasks der Reihe nach mit dem Skill `openspec-apply-change`. Kernlogik zuerst in NavigationSessionCore bzw. im SwiftPM-Paket mit Tests, danach UI.
4. Nach jedem Abschnitt: swift test + xcodebuild grün, commit mit Task-Nummer, `git push`.
5. Am Ende: Skill `openspec-verify-change`, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`, Screenshots unter docs/pilot-readiness/evidence/<change>/, PR nach pilot/first-store vorbereiten, STATUS.md-Zeile „Erik“ aktualisieren.

GRENZEN:
- Keine neuen Filter, Schwellwerte oder Timer. Parameteränderungen nur mit echten Aufnahmen (Requirement „Positioning parameter changes require recorded evidence“).
- Keine Änderungen an Suche/Settings/Profil/Info.plist/pbxproj (Person A) oder an backend/k8s/scripts/docs von B und C. Dateibesitz: AGENT_RULES.md Abschnitt 5.
- Abschnitt 10 (Zähler) früh erledigen und Person A in STATUS.md Bescheid geben – der Studienmodus hängt davon ab.
- UI-Texte exakt wie in den Specs („Ich bin hier“, „Tippe auf deinen Standort“, „Route ab Eingang“, „Nicht im Testbereich – bitte Personal fragen“).
- Ein schreibender Agent (du); optional bis zu 2 lesende Subagenten mit kleinerem Modell.

FERTIG, WENN A (Abschnitt 7 nur bei Admin-Merge), B, C (so weit ohne echte Aufnahmen möglich) und D (nur bei Admin-Merge) erledigt und als PRs vorbereitet sind. Zusammenfassung: fertig / rot / was Erik als Mensch tun muss. Archiviere nichts.
```

## Merge-Checkliste für `pilot/first-store`

1. Im Ordner `Indooro-pilot`: `git fetch origin && git merge --no-ff origin/<branch>`.
2. `cd swift/indooro-EinkaeuferFinal && swift test`, xcodebuild, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
3. Konflikte in fremden Dateien: Autor fragen, nicht raten.
4. `git push origin pilot/first-store`; Team informieren.
