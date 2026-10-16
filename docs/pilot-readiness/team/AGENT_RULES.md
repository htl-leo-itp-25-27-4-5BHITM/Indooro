# Arbeitsregeln für Coding-Agenten (Codex / Claude Code) im Pilot

Gilt für jeden Agenten, der an einem `pilot/*`-Branch arbeitet. Der Prompt jeder Person verweist auf diese Datei. Bei Widerspruch gilt: Diese Datei > Prompt > eigene Annahmen.

## 1. Ziel und Rahmen

- Ziel ist der erste Supermarkt-Pilot (siehe `docs/pilot-readiness/08_EXECUTIVE_SUMMARY.md`). Alles, was nicht in der eigenen OpenSpec-Change steht, ist **außerhalb des Auftrags**.
- **Feature-Freeze:** Keine neuen Features, keine Refactorings, keine neuen Positionsfilter oder Schwellwerte ohne Messdaten. STOP-DOING-Liste: `docs/pilot-readiness/07_ACTION_PLAN.md`, Abschnitt 5.
- Projektkonventionen: `openspec/config.yaml` (Abschnitt `context` und `rules`) lesen, bevor Code geändert wird.

## 2. Git

- Arbeite **nur** auf dem eigenen Branch in einem eigenen Worktree. Nie auf `main`, nie auf `pilot/first-store` direkt, nie auf `codex/admin-platform-rebuild`.
- Vor Arbeitsbeginn und vor jedem Pull Request: `git fetch origin` und `git merge origin/pilot/first-store` (kein Rebase von bereits gepushten Commits, kein Force-Push).
- Kleine Commits, eine Aufgabe pro Commit, ehrliche Nachricht im Stil `feat(ios): …`, `fix(ios): …`, `docs(pilot): …`, `test(ios): …`, `chore(ops): …`. Task-Nummer in die Nachricht, z. B. `fix(ios): encode search query items (prepare-pilot-ios-build 4.1)`.
- Nach jedem abgeschlossenen Abschnitt der `tasks.md`: committen und pushen (`git push -u origin <branch>`), damit nichts verloren geht.
- Keine Secrets, Passwörter, Tokens, private Telefonnummern oder E-Mail-Adressen committen. Keine Backups, keine Aufnahmen mit Gerätekennungen.
- Keine Dateien anderer Personen ändern (Besitzregeln unten). Wenn eine Änderung dort nötig ist: in `docs/pilot-readiness/team/STATUS.md` unter „Blocker“ eintragen und weiterarbeiten.

## 3. OpenSpec-Ablauf

1. Eigene Change lesen: `proposal.md`, `design.md`, `specs/**`, `tasks.md`.
2. Umsetzen mit dem Skill `openspec-apply-change` (liegt unter `.codex/skills/`), Aufgabe für Aufgabe in der Reihenfolge der `tasks.md`.
3. Nach jeder erledigten Aufgabe die Checkbox in `tasks.md` auf `- [x]` setzen. Abweichungen und neue Erkenntnisse in `design.md` unter „Implementation notes“ festhalten.
4. Aufgaben, die als **„Human step“** markiert sind, nicht simulieren: in `STATUS.md` als „wartet auf Mensch“ eintragen und mit der nächsten unabhängigen Aufgabe weitermachen.
5. Vor dem Pull Request: Skill `openspec-verify-change`, dann `npx -y @fission-ai/openspec@1.3.1 validate <change> --strict` und `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
6. Nicht archivieren. Archivieren macht Erik nach dem Feldtest.

## 4. Prüfungen (je nach Bereich)

| Bereich | Befehl | Muss |
|---|---|---|
| iOS-Navigationskern | `cd swift/indooro-EinkaeuferFinal && swift test` | alle grün (Start: 77 Tests) |
| iOS-App-Build | `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO` | `BUILD SUCCEEDED` |
| Backend | `cd backend/indooro_server && ./mvnw test` | 0 Fehler |
| Skripte | `python3 -I -m unittest discover scripts/pilot-data`, `bash -n scripts/ops/*.sh` | grün |
| OpenSpec | `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` | 0 failed |

Ein Pull Request ohne grüne Prüfungen wird nicht gemergt. Ausgaben (letzte Zeilen) in die PR-Beschreibung kopieren.

## 5. Dateibesitz (verhindert Merge-Konflikte)

Pfade relativ zu `swift/indooro-EinkaeuferFinal/indooroApp/`, wenn nicht anders angegeben.

| Datei / Bereich | Besitzer | Andere dürfen nur … |
|---|---|---|
| `Utilities/NavigationSessionCore.swift`, `NavigationSession.swift`, `Views/Main/MapView.swift`, `Models/LayoutData.swift`, neues `Utilities/LayoutCacheStore.swift` | **Erik** | nichts |
| `Views/Main/StoreMapPage.swift` | **Erik** | Person A: nur Einbinden von `PermissionBanner` (eine Zeile im Header-Bereich), nach Absprache |
| `Managers/BeaconManager.swift` | **Erik** (Layout laden, Cache, Fallback, Ziel, `isPositionTrusted`) | Person A: `apiBase`/URLs, Berechtigungs- und Bluetooth-Status, Store-Auto-Erkennung, Entfernen von `searchProducts`. Person B: nur Verdrahtung der Positionspipeline |
| `App/AppEnvironment.swift` (neu), `Managers/ProductSearchStore.swift`, `RecipeStore.swift`, `UpsellSuggestionStore.swift`, `Views/Main/ContentView.swift`, `SettingsSheet.swift`, `HomeDashboardView.swift`, Such- und Produktansichten, `Views/Components/PermissionBanner.swift` (neu), `Info.plist`, `project.pbxproj`, `Assets.xcassets` (neu) | **Person A** | nichts |
| `Utilities/PositioningPipeline.swift`, `PoseFusionService.swift`, `BeaconMeasurementStore.swift`, `BeaconPositionSolver.swift`, `StabilizedNavigationConfig.swift`, `NavigationReplay.swift`, `NavigationRecorder.swift`, `Resources/layout.json`, `swift/indooro-EinkaeuferFinal/NavigationFixtures/**`, `docs/pilot-readiness/hardware/**` | **Person B** | nichts |
| `swift/indooro-EinkaeuferFinal/Tests/**` | jeder nur eigene neue Testdateien; bestehende Dateien: Erik (Session/Routing), Person B (Replay/Schätzer) | – |
| `k8s/**`, `docker-compose.yml`, `DEPLOYMENT.md`, `scripts/ops/**`, `scripts/pilot-data/**`, `docs/pilot-readiness/operations/**`, `docs/pilot-readiness/kit/**`, später `backend/**` und `.github/**` | **Person C** | nichts |
| `docs/pilot-readiness/team/STATUS.md` | alle, nur die eigene Zeile und eigene Blocker | – |
| `openspec/changes/fix-ios-contract-and-spec-drift/tasks.md`, `harden-platform-security-baseline/tasks.md`, `stabilize-ios-navigation-pipeline/tasks.md` | alle, nur die Checkboxen der eigenen zugewiesenen Aufgaben | – |
| `backend/**`, `admin-ui/**`, `keycloak/**` vor dem Merge des Admin-Neubaus | **niemand** (Admin-Agent arbeitet daran) | – |

## 6. Wann der Agent stoppen und fragen muss

- Eine Aufgabe verlangt Änderungen an fremden Dateien.
- Ein Test, der vorher grün war, wird rot und die Ursache liegt außerhalb der eigenen Change.
- Eine Aufgabe braucht Zugang zu LeoCloud, Apple-Konto, Hardware, einem Markt oder einer Person.
- Eine Entscheidung ist in `design.md` als offen markiert.

In diesen Fällen: Eintrag in `STATUS.md` unter „Blocker“ mit genauer Frage, committen, pushen, mit der nächsten unabhängigen Aufgabe weitermachen. Wenn keine unabhängige Aufgabe übrig ist: zusammenfassen und beenden.

## 7. Modelle und Subagenten

- **Implementierung:** das stärkste verfügbare Coding-Modell eurer Codex-Version (z. B. das aktuelle GPT-5.x-Codex-Modell), Reasoning-Stufe **high**. Bei Claude Code: Opus oder Sonnet.
- **Read-only-Recherche** (Code durchsuchen, Dateien inventarisieren, Logs lesen): kleineres, schnelleres Modell (z. B. die „mini“-Variante) oder Subagenten, falls eure Version das unterstützt. Höchstens 2–3 parallel.
- **Nie** mehrere schreibende Agenten parallel auf demselben Branch. Schreiben macht genau ein Hauptagent, sequenziell.
- Sandbox: Schreibzugriff nur im Worktree. Netzwerk nur für `npx`, Maven/SwiftPM-Abhängigkeiten und `git push`. Keine Deployments, keine `kubectl apply` (nur dokumentieren).
- Lange Läufe (`xcodebuild`, `./mvnw test`) im Hintergrund starten und Ergebnis abwarten, nicht abbrechen.

## 8. Abschluss einer Sitzung

Am Ende jeder Agentensitzung:

1. Alle Änderungen committet und gepusht.
2. `STATUS.md`-Zeile aktualisiert: erledigte Tasks, nächste Tasks, Blocker, Prüfergebnisse.
3. Kurze Zusammenfassung für den Menschen: Was ist fertig, was ist rot, was braucht einen Menschen.
