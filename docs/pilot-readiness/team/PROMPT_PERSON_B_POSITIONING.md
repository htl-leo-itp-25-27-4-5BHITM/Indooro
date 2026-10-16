# Person B – Positionierung, Hardware & Messungen

## Deine Aufgabe in einem Satz

Du lieferst die ersten **echten** Messdaten zur Bluetooth-Ortung: Beacon-Standard und -Hardware festlegen, Testraum korrekt erfassen, Messprotokoll durchführen, Aufnahmen als Replay-Tests ins Repo bringen, den 17-m-Sprung erklären und Parameter nur mit Daten anpassen.

- OpenSpec-Change: `openspec/changes/establish-pilot-field-measurement/`
- Zusätzlich: offene Feld-Tasks von `stabilize-ios-navigation-pipeline` (10.4, 12.1–12.5, später 13.6)
- Branch: `pilot/field-measurement`
- Menschliche Aufgaben (der Agent kann das nicht): Beacons auswählen/bestellen lassen, Testraum vermessen, mit iPhone durch den Raum gehen und aufnehmen, größeren Raum mit Regalen organisieren, später im Markt messen.

## Vorbereitung (einmalig)

```bash
cd ~/Documents/htl
git clone git@github.com:htl-leo-itp-25-27-4-5BHITM/Indooro.git   # nur falls noch nicht vorhanden
cd Indooro
git fetch origin
git worktree add --track -b pilot/field-measurement ../Indooro-field origin/pilot/field-measurement
cd ../Indooro-field
```

Voraussetzungen: Xcode (für DEBUG-Build mit Recorder auf dem iPhone), Node.js, Laser-Entfernungsmesser oder Maßband, Kreppband für Bodenmarken.

Aufnehmen (Kurzfassung aus `swift/indooro-EinkaeuferFinal/TESTING.md`): DEBUG-Build aufs iPhone → Einstellungen → Debug → „Messungen aufzeichnen“ → an jeder Bodenmarke 0,6 s lange auf die Karte drücken (Truth-Marker) → „Aufzeichnung teilen“ per AirDrop an den Mac.

Codex starten:

```bash
codex -m <stärkstes-codex-modell> -c model_reasoning_effort="high"
```

## Prompt für deinen Codex (komplett einfügen)

```text
Du arbeitest autonom im Repository Indooro (HTL-Diplomarbeit, iOS-App für Indoor-Navigation im Supermarkt mit BLE-iBeacons) im Worktree dieses Ordners auf Branch `pilot/field-measurement`. Ziel ist der erste echte Supermarkt-Pilot. Es gibt bisher KEINE echte Messung der Ortung; alle Zahlen sind synthetisch.

LIES ZUERST, in dieser Reihenfolge:
1. docs/pilot-readiness/team/AGENT_RULES.md (verbindlich)
2. docs/pilot-readiness/03_PILOT_READINESS.md Abschnitt 4 (Positionierung, Pilotvarianten A/B/C)
3. docs/NAVIGATION_REVIEW.md Abschnitte F–H
4. openspec/config.yaml
5. openspec/changes/establish-pilot-field-measurement/ (proposal, design, specs/**, tasks.md) – dein Auftrag
6. openspec/changes/stabilize-ios-navigation-pipeline/tasks.md Gruppen 10, 12, 13
7. swift/indooro-EinkaeuferFinal/TESTING.md und NavigationFixtures/BASELINE.md

AUFTRAG:
- Setze die Tasks in openspec/changes/establish-pilot-field-measurement/tasks.md der Reihe nach um (Skill `openspec-apply-change` aus .codex/skills/). Hake erledigte Tasks ab.
- Alles, was als „Human step“ markiert ist (Bestellung, Vermessen, Aufnehmen, Raum organisieren), NICHT simulieren. Bereite stattdessen alles vor, was der Mensch dafür braucht (Checklisten, Protokoll, Vorlagen), trage den Schritt in docs/pilot-readiness/team/STATUS.md unter „Wartet auf Menschen“ ein und mache mit unabhängigen Tasks weiter.
- Wenn Aufnahmedateien (*.jsonl) im Ordner swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/ liegen: prüfe sie mit dem Anonymisierungs-Check, verschiebe sie nach NavigationFixtures/recordings/ mit sprechendem Namen, schreibe Replay- und Feldtests und den Bericht nach REPORT_TEMPLATE.md.
- Task 6.1 (17-m-Sprung in den synthetischen Replays determinism/wrongAisle): Ursache finden. Erst klären, ob es ein Szenario-Artefakt oder ein Pipeline-Defekt ist. Nur bei Defekt fixen, mit Regressionstest.
- Parameter (StabilizedNavigationConfig.swift, alles mit `// provisional`) NUR ändern, wenn mindestens zwei echte Aufnahmen vom Zielort vorliegen und Vorher/Nachher-Metriken in BASELINE.md stehen. Ohne echte Aufnahmen: KEINE Parameteränderung.
- Dateibesitz (AGENT_RULES.md Abschnitt 5): Dir gehören die Positionspipeline-Dateien, NavigationFixtures, Resources/layout.json, docs/pilot-readiness/hardware/**. NavigationSession*, MapView, StoreMapPage, LayoutData gehören Erik – nicht ändern. Öffentliche Typen, die NavigationSession nutzt, nur nach Blocker-Eintrag ändern.
- Keine neuen Filter, keine neuen Algorithmen, keine PDR/Schrittzähler, kein AR.

ARBEITSWEISE:
- Ein schreibender Agent (du). Für Lese-Recherche optional bis zu 2 Subagenten mit kleinerem Modell, nur lesend.
- Vor Beginn: `git fetch origin && git merge origin/pilot/first-store`; `cd swift/indooro-EinkaeuferFinal && swift test` und die REPLAY-Zeilen als synthetische Baseline speichern (Task 1.1).
- Hilfsskripte nur mit Python-Standardbibliothek, ausgeführt mit `python3 -I`, oder als Swift-Testhelfer im SwiftPM-Testtarget.
- Nach jedem Abschnitt: swift test, commit mit Task-Nummer (z. B. `docs(pilot): add beacon standard (establish-pilot-field-measurement 2.1)`), git push.
- Erste Pull Request nach Task 5.2 (erste echte Daten) oder, falls noch keine Daten da sind, nach Abschnitt 4 (Protokoll + Werkzeuge), Ziel `pilot/first-store`.

FERTIG (für diese Sitzung), WENN:
- Alle Tasks, die ohne Menschen möglich sind, abgehakt; swift test grün; `npx -y @fission-ai/openspec@1.3.1 validate establish-pilot-field-measurement --strict` und `validate --all --strict` grün.
- STATUS.md-Zeile „Person B“ aktualisiert, alle wartenden menschlichen Schritte mit genauer Anleitung eingetragen.
- Zusammenfassung: was fertig ist, welche Messung als Nächstes von einem Menschen gemacht werden muss, welche Zahlen vorliegen.

Archiviere keine Change.
```

## Abnahme durch Erik

- `BEACON_STANDARD.md`, `HARDWARE_SELECTION.md`, `MEASUREMENT_PROTOCOL.md`, `REPORT_TEMPLATE.md` vorhanden.
- Testraum-Layout entspricht der Vermessung, echte Beacon-IDs.
- Mindestens 3 echte Aufnahmen mit Replay-Tests und Bericht (Median/P90-Fehler).
- 17-m-Sprung erklärt.
- Empfehlung Pilotmodus (A/C/B) mit Zahlen in `RESULT_SUMMARY.md`.
