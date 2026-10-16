# Arbeitsregeln für Coding-Agenten (Codex / Claude Code) im Pilot

Gilt für jeden Agenten, der an einem `pilot/*`-Branch arbeitet. Jeder Prompt verweist auf diese Datei. Bei Widerspruch gilt: diese Datei > Prompt > eigene Annahmen.

## 1. Ziel und Rahmen

- Ziel ist der erste Supermarkt-Pilot. Überblick: `docs/pilot-readiness/team/ROADMAP.md`, Begründung: `docs/pilot-readiness/08_EXECUTIVE_SUMMARY.md`.
- Alles, was nicht in den eigenen OpenSpec-Changes steht, ist **außerhalb des Auftrags**.
- **Feature-Freeze:** keine neuen Features, keine Refactorings, keine neuen Positionsfilter oder Schwellwerte ohne Messdaten. STOP-Liste: `docs/pilot-readiness/07_ACTION_PLAN.md` Abschnitt 5 und `ROADMAP.md` Abschnitt 4.
- Projektkonventionen: `openspec/config.yaml` (Abschnitte `context` und `rules`) lesen, bevor etwas geändert wird.

## 2. Git

- Arbeite **nur** auf dem Branch der aktuellen Change. Nie direkt auf `main`, `pilot/first-store` oder `codex/admin-platform-rebuild`.
- Vor Arbeitsbeginn und vor jedem Pull Request: `git fetch origin` und `git merge origin/<Basisbranch>` (`pilot/first-store` für Pilot-Branches, `main` für `pilot/release-backend` und `pilot/store-readiness`). Kein Rebase gepushter Commits, kein Force-Push.
- Ein Commit pro Aufgabe, ehrliche Nachricht mit Task-Nummer: `fix(ios): encode search query items (prepare-pilot-ios-build 4.1)`. Typen: `feat`, `fix`, `test`, `docs`, `chore`.
- Nach jedem abgeschlossenen Abschnitt der `tasks.md`: committen und `git push`.
- **Nie committen:** Passwörter, Tokens, Client-Secrets, `.env`, Backups, echte Aufnahmen vor der Anonymisierungsprüfung, unterschriebene Formulare, Namen/Telefonnummern/E-Mails echter Personen.
- Keine Dateien anderer Personen ändern (Abschnitt 5). Wenn nötig: Blocker in `docs/pilot-readiness/team/STATUS.md` und weiterarbeiten.

## 3. OpenSpec-Ablauf

1. Change lesen: `proposal.md`, `design.md`, `specs/**`, `tasks.md`.
2. Umsetzen mit dem Skill `openspec-apply-change` (`.codex/skills/`), Aufgabe für Aufgabe in Reihenfolge.
3. Erledigte Aufgabe in `tasks.md` auf `- [x]` setzen. Abweichungen in `design.md` unter „Implementation notes“.
4. **„Human step“** nie simulieren: in `STATUS.md` unter „Wartet auf Menschen“ mit genauer Anleitung eintragen, mit der nächsten unabhängigen Aufgabe weitermachen.
5. Übernommene Aufgaben aus älteren Changes (z. B. `fix-ios-contract-and-spec-drift 4.1`) dort abhaken mit „(implemented in <change>)“.
6. Vor dem Pull Request: Skill `openspec-verify-change`, dann `npx -y @fission-ai/openspec@1.3.1 validate <change> --strict` und `… validate --all --strict`.
7. Nicht archivieren. Archivieren macht Erik nach dem Pilot.

## 4. Prüfungen

| Bereich | macOS | Windows | Muss |
|---|---|---|---|
| iOS-Navigationskern | `cd swift/indooro-EinkaeuferFinal && swift test` | – (läuft in CI, sobald `add-ios-app-test-target` gemergt ist) | alle grün |
| iOS-App-Build | `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO` | – | `BUILD SUCCEEDED` |
| Backend | `cd backend/indooro_server && sh ./mvnw test` | `cd backend\indooro_server; .\mvnw.cmd test` | 0 Fehler |
| Python-Werkzeuge | `python3 -I -m unittest discover scripts/<tool>` | `python -I -m unittest discover scripts/<tool>` | grün |
| OpenSpec | `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` | gleich | 0 failed |

Pull Requests ohne grüne Prüfungen werden nicht gemergt. Letzte Ausgabezeilen in die PR-Beschreibung.

## 5. Dateibesitz

Pfade relativ zu `swift/indooro-EinkaeuferFinal/indooroApp/`, wenn nicht anders angegeben.

| Datei / Bereich | Besitzer | Andere dürfen nur … |
|---|---|---|
| `Utilities/NavigationSessionCore.swift`, `NavigationSession.swift`, `IndoorGraph.swift`, `Views/Main/MapView.swift`, `Models/LayoutData.swift`, `Utilities/LayoutCacheStore.swift` (neu) | **Erik** | lesen |
| Positionspipeline: `Utilities/PositioningPipeline.swift`, `PoseFusionService.swift`, `BeaconMeasurementStore.swift`, `BeaconPositionSolver.swift`, `StabilizedNavigationConfig.swift`, `NavigationReplay.swift`, `NavigationRecorder.swift`, `Resources/layout.json`, `swift/indooro-EinkaeuferFinal/NavigationFixtures/**` | **Erik** | lesen |
| `Views/Main/StoreMapPage.swift` | **Erik** | Person A: eine Zeile zum Einbinden von `PermissionBanner`, nach Absprache |
| `Managers/BeaconManager.swift` | **Erik** (Layout, Cache, Fallback, Ziel, Pipeline-Verdrahtung, `isPositionTrusted`) | Person A: `apiBase`/URLs, Berechtigungs-/Bluetooth-Status, Store-Auto-Erkennung, Entfernen von `searchProducts` |
| `App/AppEnvironment.swift` (neu), `Managers/ProductSearchStore.swift`, `RecipeStore.swift`, `UpsellSuggestionStore.swift`, `Views/Main/ContentView.swift`, `SettingsSheet.swift`, `HomeDashboardView.swift`, Such-/Produktansichten, `Views/Components/PermissionBanner.swift`, `Views/Study/**`, `Managers/StudySessionStore.swift`, `Models/StudyModels.swift`, `Info.plist`, `project.pbxproj`, `Assets.xcassets` | **Person A** | lesen |
| `swift/indooro-EinkaeuferFinal/MCindooroAppTests/**`, `swift/indooro-EinkaeuferFinal/Fixtures/**`, `.github/workflows/ios.yaml`; nach dem Admin-Merge die neuen Readiness-Dateien (`StoreReadiness*` im Backend, Seite „Pilot-Bereitschaft“ in `admin-ui/`) | **Erik** | lesen |
| `swift/indooro-EinkaeuferFinal/Tests/**` | Erik (bestehende Dateien); jeder darf neue eigene Testdateien anlegen | – |
| `k8s/**`, `docker-compose.yml`, `.env.example`, `DEPLOYMENT.md`, `.github/workflows/ci.yaml`, `scripts/ops/**`, `docs/pilot-readiness/operations/{BACKUP_RESTORE,SECRET_ROTATION,RELEASE_RUNBOOK,RELEASES}.md`; nach dem Admin-Merge `backend/**`, `admin-ui/**`, `keycloak/**` (außer Erik’s Readiness-Dateien) | **Person B** | lesen |
| `docs/pilot-readiness/hardware/**`, `docs/pilot-readiness/kit/**`, `docs/pilot-readiness/evaluation/**`, übrige `docs/pilot-readiness/operations/**`, `scripts/pilot-data/**`, `scripts/field/**`, `scripts/beacon-planner/**`, `scripts/pilot-eval/**` | **Person C** | lesen |
| `docs/pilot-readiness/team/STATUS.md` | alle: nur eigene Zeile und eigene Blocker | – |
| `tasks.md` älterer Changes | alle: nur Checkboxen der eigenen zugewiesenen Aufgaben | – |
| `backend/**`, `admin-ui/**`, `keycloak/**` **vor** dem Admin-Merge in `main` | **niemand** außer dem Admin-Agenten | – |
| `swift/indooroApp/**`, `swift/indooro-/**` (Legacy-Apps) | **niemand** | – |

## 6. Wann der Agent stoppen und fragen muss

- Eine Aufgabe verlangt Änderungen an fremden Dateien.
- Ein vorher grüner Test wird rot und die Ursache liegt außerhalb der eigenen Change.
- Eine Aufgabe braucht LeoCloud, Apple-Konto, Hardware, einen Markt oder eine Person.
- Eine Entscheidung ist in `design.md` als offen markiert.

Dann: Blocker in `STATUS.md` mit genauer Frage, committen, pushen, nächste unabhängige Aufgabe. Ist keine mehr übrig: zur nächsten Change der eigenen Reihenfolge wechseln (Prompt). Ist auch die blockiert: zusammenfassen und beenden.

## 7. Modelle, Subagenten, Umgebung

- **Implementierung:** stärkstes verfügbares Coding-Modell eurer Codex-Version, Reasoning **high**. Bei Claude Code: Opus.
- **Read-only-Recherche:** kleineres Modell oder Subagenten (falls verfügbar), höchstens 2–3 parallel, nur lesend.
- **Nie** mehrere schreibende Agenten auf demselben Branch oder denselben Dateien.
- Sandbox: Schreiben nur im eigenen Arbeitsordner. Netzwerk nur für `npx`, Maven/SwiftPM/npm-Abhängigkeiten, `git push` und anonyme GET-Requests an die Mobile-API. Keine Deployments, kein `kubectl apply/exec/delete` – nur dokumentieren.
- **Windows:** Codex am besten in WSL2 (Ubuntu) oder in der Codex-IDE-Erweiterung ausführen. Python-Skripte müssen trotzdem unter Windows-PowerShell laufen (Pfade mit `pathlib`, keine Bash-Syntax). Git mit `core.autocrlf=input` konfigurieren, damit keine Zeilenenden-Diffs entstehen.
- Lange Läufe (`xcodebuild`, `mvnw test`) abwarten, nicht abbrechen.

## 8. Ende jeder Sitzung

1. Alles committet und gepusht.
2. `STATUS.md`-Zeile aktualisiert: erledigte Tasks, nächste Tasks, Blocker, Prüfergebnisse.
3. Kurze Zusammenfassung für den Menschen: fertig / rot / Mensch nötig.
