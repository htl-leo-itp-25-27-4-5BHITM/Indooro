# Hardware und Feldmessung (Index)

Status: Entwurf. Gehört zu `openspec/changes/establish-pilot-field-measurement/`. Alle Messwerte fehlen noch. Schritte mit `(Mensch: …)` brauchen eine Person vor Ort oder am Mac.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `BEACON_STANDARD.md` | Projekt-UUID, Major und Minor, Startwerte, Etikett, Montageregeln, Abstand 6 bis 8 m |
| `beacons.csv` | Konfigurationsdatensatz der Beacons (nur Kopfzeile, Daten offen) |
| `CONFIGURE_BEACON.md` | Schritte zur Konfiguration, Log-Schlüssel für die Prüfung der Identität |
| `HARDWARE_SELECTION.md` | Auswahl des Beacon-Modells (Stub, Vergleich offen) |
| `MEASUREMENT_PROTOCOL.md` | Messprotokoll: Marker, Szenarien S1 bis S4, Akku-Test, Dry-Run, Mac-Pipeline |
| `REPORT_TEMPLATE.md` | Vorlage für Messberichte (ausstehend, Datei noch nicht vorhanden) |
| `CHECKLIST_GROSSER_RAUM.md` | Checkliste für den großen Testraum (Tasks 5.3 und 5.4) |
| `PARAMETER_ANALYSIS.md` | Parameteranalyse der Off-Route-Regel und des Sprung-Gates, Entscheidungsregel |
| `RESULT_SUMMARY.md` | Ergebnisübersicht je Standort, Empfehlung für Abstand und Pilotmodus |
| `sites/SITE_TEMPLATE.md` | Vorlage für die Standort-Datei mit Marker- und Gang-Tabelle |
| `reports/0000-synthetic-baseline.md` | Synthetischer Replay-Stand, keine Messung |

## Mac-Pipeline (ende-zu-ende)

Die Befehle laufen im Repo-Wurzelverzeichnis, außer wenn anders angegeben. Details in `MEASUREMENT_PROTOCOL.md`, Abschnitt 7. Die Skripte in `scripts/field/` entstehen mit Task 4.4 und 4.5.

1. Aufnahmen aus `swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/` prüfen und übernehmen:
   `python -I scripts/field/import_recordings.py --site <site> --date <YYYY-MM-DD> --move`
2. Ticks je Aufnahme exportieren:
   `cd swift/indooro-EinkaeuferFinal && FIELD_EXPORT_DIR=<ausgabeordner> swift test --filter FieldExport`
3. Positionsfehler und Gang-Anteil berechnen:
   `python -I scripts/field/field_stats.py --layout docs/pilot-readiness/hardware/sites/layout-<site>.json --markers docs/pilot-readiness/hardware/sites/<site>.md --ticks <datei>-ticks.csv [...] --out <tabelle>.md`
4. Report aus `REPORT_TEMPLATE.md` unter `reports/<YYYY-MM-DD>-<site>.md` anlegen. Tabelle aus Schritt 3 einfügen, Pilotmodus nach `03_PILOT_READINESS.md`, Abschnitt 4.3, festlegen.
5. Replay-Tests mit den neuen Aufnahmen laufen lassen (`swift test --filter NavigationReplayTests`) und Metriken in `NavigationFixtures/BASELINE.md` eintragen, falls Parameter geändert werden. Ohne Nachweis (`PARAMETER_ANALYSIS.md`, Abschnitt 4) bleibt alles unverändert.
6. Ergebnisse in `RESULT_SUMMARY.md` übernehmen und `team/STATUS.md` aktualisieren.
