# Person A – iOS UX & Pilot-Build

## Deine Aufgabe in einem Satz

Du machst die iOS-App „pilotfähig“: robuste Suche, ruhige deutsche Oberfläche ohne Entwicklerbegriffe, Berechtigungen erst bei Bedarf, Pilot-Profil ohne Rezepte/Upsell/AR, App-Icon und Installation auf echten iPhones.

- OpenSpec-Change: `openspec/changes/prepare-pilot-ios-build/`
- Zusätzlich: `fix-ios-contract-and-spec-drift` Abschnitte 3, 4, 5, 6, 10
- Branch: `pilot/ios-pilot-build`
- Prüfungen: `swift test`, `xcodebuild` (Simulator), OpenSpec-Validierung
- Menschliche Aufgaben: iOS-Versionen der Testgeräte sammeln (Task 1.3), App auf ein echtes iPhone installieren (Task 7.3)

## Vorbereitung (einmalig, im Terminal)

```bash
cd ~/Documents/htl            # oder dein Projektordner
git clone git@github.com:htl-leo-itp-25-27-4-5BHITM/Indooro.git   # nur falls noch nicht vorhanden
cd Indooro
git fetch origin
git worktree add --track -b pilot/ios-pilot-build ../Indooro-ios-pilot origin/pilot/ios-pilot-build
cd ../Indooro-ios-pilot
```

Voraussetzungen: Xcode mit iOS-Simulator, Node.js (für `npx`), Swift-Toolchain (kommt mit Xcode).

Codex starten (Modellname an deine Codex-Version anpassen):

```bash
codex -m <stärkstes-codex-modell> -c model_reasoning_effort="high"
```

## Prompt für deinen Codex (komplett einfügen)

```text
Du arbeitest autonom im Repository Indooro (HTL-Diplomarbeit, iOS-App für Indoor-Navigation im Supermarkt) im Worktree dieses Ordners auf Branch `pilot/ios-pilot-build`. Ziel ist der erste echte Supermarkt-Pilot.

LIES ZUERST, in dieser Reihenfolge:
1. docs/pilot-readiness/team/AGENT_RULES.md  (verbindliche Regeln: Git, Dateibesitz, Prüfungen, Stopp-Bedingungen, Modelle)
2. docs/pilot-readiness/08_EXECUTIVE_SUMMARY.md und docs/pilot-readiness/03_PILOT_READINESS.md (Kontext)
3. openspec/config.yaml (Projektkonventionen)
4. openspec/changes/prepare-pilot-ios-build/ (proposal.md, design.md, specs/**, tasks.md) – das ist dein Auftrag
5. openspec/changes/fix-ios-contract-and-spec-drift/tasks.md Abschnitte 3, 4, 5, 6, 10 – diese setzt du über deine Change mit um
6. swift/indooro-EinkaeuferFinal/TESTING.md

AUFTRAG:
- Setze alle Tasks in openspec/changes/prepare-pilot-ios-build/tasks.md der Reihe nach um. Nutze dafür den Skill `openspec-apply-change` aus .codex/skills/.
- Hake jede erledigte Task in tasks.md ab. Halte Abweichungen in design.md unter „Implementation notes“ fest.
- Tasks mit „Human step“ (z. B. 1.3 Geräteliste, 7.3 echtes iPhone) nicht simulieren: in docs/pilot-readiness/team/STATUS.md unter „Wartet auf Menschen“ eintragen und weitermachen.
- Halte dich strikt an den Dateibesitz in AGENT_RULES.md Abschnitt 5. In Managers/BeaconManager.swift darfst du NUR: apiBase/URL-Bau, Berechtigungs- und Bluetooth-Status, Store-Auto-Erkennung (Pilot-Profil), Entfernen von searchProducts. Navigation (NavigationSession*, MapView, LayoutData, Zielkarte/Tour-Panel in StoreMapPage) gehört Erik – nicht anfassen.
- Keine neuen Features außerhalb der Change. Kein Redesign. Rezepte, Upsell und AR werden im Profil „pilot“ nur ausgeblendet, nicht gelöscht.
- Task 6.5 (tote Views löschen): erst nach Rückfrage – trage sie als Blocker „mit Erik abstimmen“ ein, außer STATUS.md enthält bereits eine Freigabe.

ARBEITSWEISE:
- Arbeite mit genau einem schreibenden Agenten (dir). Für reine Lese-Recherche (Code durchsuchen, Aufrufer finden) darfst du, falls verfügbar, bis zu 2 Subagenten mit einem kleineren Modell parallel nutzen. Sie dürfen keine Dateien ändern.
- Vor Beginn: `git fetch origin && git merge origin/pilot/first-store`. Dann Baseline: `cd swift/indooro-EinkaeuferFinal && swift test` und den xcodebuild-Befehl aus AGENT_RULES.md ausführen; Ergebnisse in design.md unter „Baseline“.
- Nach jedem Abschnitt der tasks.md: swift test + xcodebuild, dann commit (Nachricht mit Task-Nummer, z. B. `fix(ios): encode search query items (prepare-pilot-ios-build 4.1)`) und `git push`.
- Reine Logik (URL-Bau, AppEnvironment-Parsing) als testbare Funktionen schreiben und mit Tests absichern.
- Alle sichtbaren Texte auf Deutsch, Anführungszeichen „…“ wie im bestehenden Code.
- Keine Secrets, keine Gerätekennungen committen.

FERTIG, WENN:
- Alle nicht-menschlichen Tasks abgehakt, swift test grün, xcodebuild BUILD SUCCEEDED, `npx -y @fission-ai/openspec@1.3.1 validate prepare-pilot-ios-build --strict` und `validate --all --strict` grün.
- Skill `openspec-verify-change` ausgeführt, Ergebnis in design.md.
- Screenshots unter docs/pilot-readiness/evidence/ios-pilot-build/ (Simulator).
- Branch gepusht. Pull Request `pilot/ios-pilot-build` → `pilot/first-store` beschrieben (falls `gh` verfügbar: `gh pr create --base pilot/first-store`; sonst Text für den PR in docs/pilot-readiness/evidence/ios-pilot-build/PR.md ablegen).
- STATUS.md-Zeile „Person A“ aktualisiert.
- Abschluss-Zusammenfassung: was fertig ist, was rot ist, was ein Mensch tun muss.

Archiviere die Change NICHT.
```

## Abnahme durch Erik

- Release-Einstellungen ohne „Debug“, „Tracking“, „Beacon“.
- „Milch & Käse“ findet Treffer, Serverfehler zeigt „Suche fehlgeschlagen“.
- Frische Installation: keine Berechtigungsabfrage, Einführung erscheint einmal.
- Profil `pilot`: kein Rezepte-Tab, keine Upsell-Requests im Debug-Netzwerklog.
- App mit Icon auf mindestens einem echten iPhone installiert.
