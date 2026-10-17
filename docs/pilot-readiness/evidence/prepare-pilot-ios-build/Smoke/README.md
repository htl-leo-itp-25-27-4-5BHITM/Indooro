# Separater Simulator-Smoke

Kein Target der App verändert. Erst den geprüften Debug-Build auf einem Simulator installieren, dann aus Repository-Root:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project docs/pilot-readiness/evidence/prepare-pilot-ios-build/Smoke/Smoke.xcodeproj -scheme PilotSmoke -destination 'platform=iOS Simulator,id=<UDID>' test CODE_SIGNING_ALLOWED=NO
```

Der Test verwendet einen absichtlich unerreichbaren DEBUG-API-Endpunkt. Er prüft Einführung, keine sichtbaren System-Alerts, vier Pilot-Tabs, Suche mit Sonderzeichen und Retry, Settings ohne AR. App-Icon-Screenshot nach Abschluss per simctl aufgenommen. Keine echte Produktsuche, keine Hardware-Prüfung. Ein früherer Erweiterungslauf scheiterte am verdeckten Tab unter der Tastatur; der Test bestätigt nun die Suche mit Enter vor dem Tabwechsel. Der finale Lauf A-smoke3 war grün.
