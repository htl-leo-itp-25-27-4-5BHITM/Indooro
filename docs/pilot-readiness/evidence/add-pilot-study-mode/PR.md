# feat(ios): Pilot-Studienmodus für Leihgeräte

Base: `pilot/first-store`  
Head: `pilot/ios-study-mode`

PR-Text-Fallback gemäß Auftrag: gh ist nicht installiert; noch kein GitHub-PR angelegt. Zuerst A nach pilot/first-store mergen, danach B prüfen/integrieren. B enthält den ausdrücklich autorisierten Merge von origin/pilot/ios-pilot-build.

## Änderungen

- Info-Flag standardmäßig false; Testleitung nur auf konfigurierten Leihgeräten.
- Strenge Test-IDs, Aufgaben mit/ohne App, monotone Zeit, Ergebnisse und lokale Notizen.
- Produktziel/Kartenabschluss, gespeicherte Sitzungen wieder auswählen, lokaler CSV-/JSONL-Export über ShareLink, bestätigte Löschung.
- Eigene Tests und synthetischer Simulator-Export in dieser Evidence; keine Navigationsdatei geändert.

## Prüfungen

```text
Executed 14 tests, with 0 failures
Executed 77 tests, with 0 failures
** BUILD SUCCEEDED **
UI Kundenflag: Executed 1 test, with 0 failures
UI T01: Executed 1 test, with 0 failures
** TEST SUCCEEDED **
Totals: 64 passed, 0 failed (64 items)
```

## Offene Gates

- Erik: monotone NavigationSession-Zähler und manualPosition/reroute/stopChange-Events veröffentlichen; bis dahin Design-Fallback mit „-“.
- Person C: Dateien aus `study-export-sample/` in `docs/pilot-readiness/kit/study-export-sample/` übernehmen (Eigentumsgrenze).
- Team: echte Leihgeräte festlegen, Installation, Filial-/Produktziel und manuelle Position mit integrierter Navigation prüfen. Kein Versand/Upload getestet oder durchgeführt.

VERIFY.md und CHECKS.md enthalten Abweichungen und Nachweise. Keine Archivierung.
