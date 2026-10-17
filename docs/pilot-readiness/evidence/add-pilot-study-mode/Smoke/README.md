# Simulator-Smoke Studienmodus

Separater UI-Test-Runner, kein App-/Erik-Target geändert. iPhone 17, iOS 27 Simulator; keine Hardware-Messung.

1. Geprüften Debug-Build normal installieren, `testStudyIsHiddenForCustomer` ausführen (IndooroStudyMode=false).
2. Kopie des gebauten App-Bundles erstellen, dort Info.plist `IndooroStudyMode=true` setzen und beigelegte `study-tasks.json` ins Bundle kopieren. Quell-Info.plist bleibt false. Kopie installieren, `testThreeSyntheticTasksAndLocalExport` ausführen. Frischer Studien-Datenspeicher erforderlich.
3. Beide Tests einzeln über `-only-testing:PilotSmoke/StudySmoke/<Testname>` auswählen:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project docs/pilot-readiness/evidence/add-pilot-study-mode/Smoke/Smoke.xcodeproj -scheme PilotSmoke -destination 'platform=iOS Simulator,id=<UDID>' test CODE_SIGNING_ALLOWED=NO -only-testing:PilotSmoke/StudySmoke/<Testname>
```

Test-ID Anna muss gesperrt sein, T01 startet; zwei App-Aufgaben und eine ohne App, Ergebnis gefunden/hilfe/gefunden, Export und System-Share-Sheet. API absichtlich lokal unerreichbar; keine echten Produkte/Personen. Zeiten stammen aus dem UI-Lauf und sind keine Pilot-Messwerte.
