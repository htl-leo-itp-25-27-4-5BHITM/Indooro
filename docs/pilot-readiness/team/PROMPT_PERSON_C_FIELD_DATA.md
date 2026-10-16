# Person C (Windows) – Feld, Hardware, Daten, Pilot-Kit, Auswertung

## Kurz

Du sorgst dafür, dass wir einen Markt messen, erfassen und auswerten können. Vier Changes in dieser Reihenfolge:

1. `prepare-pilot-store-operations` (Branch `pilot/store-operations`): Layout-Konventionen, CSV→Import-Werkzeug mit Prüfung, komplettes Pilot-Kit (One-Pager, Brief, Vereinbarung, Einwilligungen, Fragebogen, Testprotokoll, Checklisten).
2. `add-beacon-placement-planner` (Branch `pilot/beacon-planner`): Python-Werkzeug, das aus einem Grundriss berechnet, wie viele Beacons wohin müssen, mit Abdeckungskarte.
3. `establish-pilot-field-measurement`, nur Tasks mit **[C]** (Branch `pilot/field-measurement`): Beacon-Standard, Hardware-Auswahl, Messprotokoll, Berichtsvorlage, Python-Analyse der Messdaten. Die Swift-Teile [E] macht Erik.
4. `prepare-pilot-evaluation` (Branch `pilot/pilot-evaluation`): Python-Auswertung der Testsitzungen gegen die Erfolgskriterien.

Menschliche Aufgaben (wichtig, macht kein Agent):
- Beacons auswählen und mit Erik/Schule bestellen.
- Testraum mit Laser-Entfernungsmesser vermessen.
- Messläufe mit einem iPhone gehen. Den DEBUG-Build mit Recorder installiert Erik oder Person A auf das Gerät.
- Einen größeren Raum mit Regalen organisieren.
- Kontaktliste der Märkte führen (außerhalb des Repos). Mit Erik zu Gesprächen gehen.

## Einmalige Vorbereitung (Windows)

Empfohlen: Codex in **WSL2 (Ubuntu)**:

```bash
sudo apt update && sudo apt install -y git python3 nodejs npm
git config --global core.autocrlf input
cd ~
git clone git@github.com:htl-leo-itp-25-27-4-5BHITM/Indooro.git indooro-field
cd indooro-field
git switch --track origin/pilot/store-operations
```

Zusätzlich Python 3 unter Windows installieren (python.org), damit du die Skripte auch in PowerShell testen kannst.

Codex starten:

```bash
codex -m <stärkstes-codex-modell> -c model_reasoning_effort="high"
```

## Prompt (komplett in Codex einfügen)

```text
Du arbeitest autonom im Repository Indooro (HTL-Schulprojekt: iOS-App für Indoor-Navigation im Supermarkt mit BLE-iBeacons, Quarkus-Backend, Web-Admin). Ziel ist der erste echte Supermarkt-Pilot. Du bist der Agent von Person C (Feld, Daten, Pilot-Kit; Windows/WSL2, KEIN Mac – Swift kann hier weder gebaut noch getestet werden).

LIES ZUERST:
1. docs/pilot-readiness/team/AGENT_RULES.md – verbindlich
2. docs/pilot-readiness/team/ROADMAP.md
3. docs/pilot-readiness/03_PILOT_READINESS.md (Abschnitte 4 und 6), 05_PILOT_IMPLEMENTATION.md, 06_BUSINESS_OUTREACH.md
4. openspec/config.yaml

DEINE CHANGES, IN DIESER REIHENFOLGE:
A) openspec/changes/prepare-pilot-store-operations/      Branch pilot/store-operations
B) openspec/changes/add-beacon-placement-planner/       Branch pilot/beacon-planner
C) openspec/changes/establish-pilot-field-measurement/  Branch pilot/field-measurement – NUR Tasks mit [C]; Tasks mit [E] gehören Erik, nicht anfassen
D) openspec/changes/prepare-pilot-evaluation/           Branch pilot/pilot-evaluation (prüfe in STATUS.md, ob Person B sie übernommen hat)
WELLE 2 (NUR nach dem Admin-Merge in main; Branch `git switch -c <branch> origin/main`, Change-Ordner mit `git checkout origin/pilot/first-store -- openspec/changes/<change> docs/pilot-readiness/team` übernehmen und committen; Pull Request nach main):
E) openspec/changes/upgrade-customer-web-product-finder/  Branch pilot/web-finder – darf als einzige Ausnahme backend/indooro_server/src/main/resources/META-INF/resources/customer/** ändern; Tests mit `node --test`
F) openspec/changes/add-editor-beacon-coverage-overlay/   Branch pilot/editor-coverage – nach Merge von add-beacon-placement-planner; nur admin-ui/src/editor/coverage.ts und das Overlay

ABLAUF JE CHANGE:
1. `git fetch origin`, Branch wechseln (`git switch --track origin/<branch>` bzw. `git switch <branch>`), `git merge origin/pilot/first-store`.
2. proposal.md, design.md, specs/**, tasks.md lesen; Tasks der Reihe nach mit dem Skill `openspec-apply-change`; jede erledigte Task abhaken.
3. Nach jedem Abschnitt: `python3 -I -m unittest discover scripts/<werkzeug>` grün, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` grün, commit mit Task-Nummer, `git push`.
4. Am Ende der Change: Skill `openspec-verify-change`, Pull Request nach pilot/first-store (`gh pr create --base pilot/first-store` falls verfügbar, sonst PR-Text in docs/pilot-readiness/evidence/<change>/PR.md), STATUS.md-Zeile „Person C“ aktualisieren. Dann nächste Change.

HARTE GRENZEN:
- Alle Werkzeuge in Python 3.10+, NUR Standardbibliothek, lauffähig mit `python -I` unter Windows-PowerShell und `python3 -I` unter WSL/macOS (Pfade mit pathlib, Encoding UTF-8 explizit, CSV mit BOM akzeptieren).
- Kein Swift-Code, keine iOS-Dateien, kein backend/**, admin-ui/**, k8s/** – das gehört anderen (AGENT_RULES.md Abschnitt 5).
- „Human step“-Tasks (Bestellen, Vermessen, Messläufe gehen, Raum organisieren, Kontakte, Betreuung) NICHT simulieren: alles vorbereiten, was der Mensch braucht (Checklisten, Vorlagen, Anleitungen), in STATUS.md unter „Wartet auf Menschen“ mit genauer Anleitung eintragen, mit der nächsten unabhängigen Task weitermachen.
- Echte Aufnahmen, ausgefüllte Kontaktlisten, unterschriebene Formulare und echte Studiendaten kommen NIE ins Repository. Tests nur mit synthetischen Daten. Keine Namen, Telefonnummern oder E-Mails echter Personen; nur Schuladresse und Platzhalter.
- Das reale Layout „SparSupermarkt_Posttrasse“ und Belegplan-Dateien nur verwenden, wenn STATUS.md die Freigabe (prepare-pilot-store-operations Task 5.2) enthält.
- Das Exportformat des iOS-Studienmodus ist in openspec/changes/add-pilot-study-mode/design.md Entscheidung 4 festgelegt; daran hältst du dich exakt.
- Ein schreibender Agent (du); optional bis zu 2 lesende Subagenten mit kleinerem Modell.

FERTIG, WENN alle deine Changes (A–F, Welle 2 erst nach dem Admin-Merge) bis auf Human steps und [E]-Tasks erledigt, geprüft, gepusht und als PR vorbereitet sind – oder alle restlichen Tasks blockiert sind. Zusammenfassung: fertig / rot / welche Messung oder Organisation als Nächstes ein Mensch erledigen muss. Archiviere nichts.
```

## Abnahme (Erik prüft)

- `python -I -m unittest discover scripts/pilot-data` (und `beacon-planner`, `field`, `pilot-eval`) grün unter Windows.
- Kit vollständig unter `docs/pilot-readiness/kit/` (inkl. PDFs oder Hinweis).
- Planer-Ergebnis für Testraum und Demo-Markt in `docs/pilot-readiness/hardware/PLANNER.md`.
- Beacon-Standard, Hardware-Empfehlung, Messprotokoll, Berichtsvorlage vorhanden.
- Auswertung erzeugt aus synthetischen Daten `report.md` und `report-markt.md`.
