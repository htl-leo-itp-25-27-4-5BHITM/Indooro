# Person A (Mac) – iOS-App

## Kurz

Du machst die iOS-App pilotfähig und messbar. Drei Changes in dieser Reihenfolge:

1. `prepare-pilot-ios-build` (Branch `pilot/ios-pilot-build`): robuste Suche, Pilot-Profil ohne Rezepte/Upsell/AR, Berechtigungen erst bei Bedarf, deutsche Texte, App-Icon, Installation auf echten iPhones. Plus `fix-ios-contract-and-spec-drift` 3, 4, 5, 6, 10.
2. `add-ios-app-test-target` (Branch `pilot/ios-test-target`): XCTest-Target, JSON-Fixtures, GitHub-Actions-Workflow für Swift-Tests (davon profitieren die Windows-Kollegen).
3. `add-pilot-study-mode` (Branch `pilot/ios-study-mode`): Testleitungs-Modus mit Zeitmessung, Ergebnis und Export für die Auswertung.

Menschliche Aufgaben (macht kein Agent): iOS-Versionen der Team-iPhones sammeln; Test-Target einmal in der Xcode-Oberfläche anlegen (5 Minuten, Change 2 Task 1.2); App auf echte iPhones installieren; DEBUG-Build für Messungen auf das iPhone von Person C installieren, wenn Erik keine Zeit hat.

## Einmalige Vorbereitung (Terminal)

```bash
cd ~/Documents
git clone git@github.com:htl-leo-itp-25-27-4-5BHITM/Indooro.git indooro-pilot-a
cd indooro-pilot-a
git switch --track origin/pilot/ios-pilot-build
xcode-select -p          # muss auf Xcode zeigen
node --version           # für npx OpenSpec
```

Codex starten (Modellname an eure Version anpassen):

```bash
codex -m <stärkstes-codex-modell> -c model_reasoning_effort="high"
```

## Prompt (komplett in Codex einfügen)

```text
Du arbeitest autonom im Repository Indooro (HTL-Diplomarbeit: SwiftUI-iOS-App für Indoor-Navigation im Supermarkt mit BLE-iBeacons, Quarkus-Backend, Web-Admin). Ziel ist der erste echte Supermarkt-Pilot. Du bist der Agent von Person A (iOS, macOS mit Xcode).

LIES ZUERST, in dieser Reihenfolge:
1. docs/pilot-readiness/team/AGENT_RULES.md – verbindlich (Git, Dateibesitz, Prüfungen, Stopp-Regeln, Modelle)
2. docs/pilot-readiness/team/ROADMAP.md und docs/pilot-readiness/08_EXECUTIVE_SUMMARY.md – Kontext
3. openspec/config.yaml – Projektkonventionen
4. swift/indooro-EinkaeuferFinal/TESTING.md

DEINE CHANGES, STRIKT IN DIESER REIHENFOLGE:
A) openspec/changes/prepare-pilot-ios-build/            Branch pilot/ios-pilot-build   (inkl. fix-ios-contract-and-spec-drift 3, 4, 5, 6, 10)
B) openspec/changes/add-ios-app-test-target/            Branch pilot/ios-test-target
C) openspec/changes/add-pilot-study-mode/               Branch pilot/ios-study-mode   (erst wenn A in pilot/first-store gemergt ist; sonst A auf diesem Branch mergen: git merge origin/pilot/ios-pilot-build)

ABLAUF JE CHANGE:
1. `git fetch origin`, auf den Branch wechseln (`git switch <branch>` oder `git switch --track origin/<branch>`), `git merge origin/pilot/first-store`.
2. Baseline: `cd swift/indooro-EinkaeuferFinal && swift test` und den xcodebuild-Befehl aus AGENT_RULES.md; Ergebnis in design.md unter „Baseline“.
3. proposal.md, design.md, specs/**, tasks.md lesen. Tasks der Reihe nach mit dem Skill `openspec-apply-change` umsetzen, jede erledigte Task abhaken.
4. Nach jedem Abschnitt: swift test + xcodebuild grün, commit mit Task-Nummer, `git push`.
5. Am Ende: Skill `openspec-verify-change`, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`, Screenshots unter docs/pilot-readiness/evidence/<change>/, Pull Request nach pilot/first-store (`gh pr create --base pilot/first-store` falls verfügbar, sonst PR-Text in docs/pilot-readiness/evidence/<change>/PR.md), STATUS.md-Zeile „Person A“ aktualisieren.
6. Dann nächste Change.

WICHTIGE GRENZEN:
- Dateibesitz laut AGENT_RULES.md Abschnitt 5. Navigation (NavigationSession*, IndoorGraph, MapView, LayoutData, Zielkarte/Tour-Panel in StoreMapPage) und Positionspipeline gehören Erik. In BeaconManager.swift darfst du NUR: apiBase/URL-Bau, Berechtigungs- und Bluetooth-Status, Store-Auto-Erkennung im Pilot-Profil, Entfernen von searchProducts.
- Rezepte, Upsell, AR im Profil „pilot“ nur ausblenden, nicht löschen.
- prepare-pilot-ios-build Task 6.5 (tote Views löschen): nur, wenn STATUS.md eine Freigabe von Erik enthält; sonst Blocker eintragen.
- add-ios-app-test-target Task 1.2 (Target in Xcode anlegen) ist ein Human step: wenn das Target noch nicht existiert, Blocker „Person A: Target in Xcode anlegen (5 min, Anleitung design.md Entscheidung 1)“ eintragen und inzwischen die Fixtures (Abschnitt 2) vorbereiten.
- Defekte, die Tests in fremden Dateien zeigen: Blocker für den Besitzer, nicht selbst fixen.
- Keine neuen Features außerhalb der Changes. Alle Texte deutsch mit „…“-Anführungszeichen wie im Code.
- Ein schreibender Agent (du). Für reine Code-Suche optional bis zu 2 lesende Subagenten mit kleinerem Modell.

FERTIG, WENN alle drei Changes bis auf Human steps erledigt, geprüft, gepusht und als PR vorbereitet sind – oder alle verbleibenden Tasks blockiert sind. Schreibe dann eine Zusammenfassung: fertig / rot / was ein Mensch tun muss. Archiviere keine Change.
```

## Abnahme (Erik prüft)

- Suche mit „Milch & Käse“ funktioniert; Serverfehler zeigt „Suche fehlgeschlagen“.
- Frische Installation: keine Berechtigungsabfrage, Einführung einmal; Profil `pilot` ohne Rezepte, ohne Upsell-Requests.
- App mit Icon auf mindestens einem echten iPhone.
- `MCindooroAppTests` existiert, GitHub-Workflow `ios.yaml` läuft grün.
- Studienmodus: Beispiel-Export unter `docs/pilot-readiness/kit/study-export-sample/`.
