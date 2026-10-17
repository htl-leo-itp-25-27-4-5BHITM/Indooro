# Verifikation: prepare-pilot-ios-build

2026-10-16 · Code-Stand `15641d3`, verglichen mit `origin/pilot/first-store`. Workflow `openspec-verify-change`: Status und Apply-Kontext erneut geladen, alle fünf Change-Artefakte mit Code und Szenarien abgeglichen. Kein Archivieren.

## Ergebnis

- Automatisiert: 77 vorhandene Navigations-Tests + 9 neue Konfigurations-/Netzwerk-Tests erfolgreich; Simulator-Build erfolgreich; Change gültig; OpenSpec gesamt 64 passed, 0 failed. Siehe `CHECKS.md`.
- Szenarien Query-Zeichen, beide ISO-8601-Formate, fehlerhafte Einzelelemente, HTTP-503 und Timeout: reine Tests in `Tests/IndooroPilotSupportTests`.
- Ein separater UI-Lauf am iPhone-17-Simulator (iOS 27) prüft Erststart ohne sichtbaren Berechtigungsdialog, Pilot-Tabs und Suche „Milch & Käse“ bei unerreichbarem Server mit sichtbarem Retry. TEST SUCCEEDED. Screenshots hier; Server war per DEBUG-Umgebungsvariable `https://127.0.0.1:1/api` absichtlich unerreichbar. Kein Nachweis einer erfolgreichen Live-Produktsuche.
- Erweiterter separater UI-Lauf (A-smoke3): TEST SUCCEEDED; Settings „Ohne Ortung“, AR ausgeblendet, bestehendes Logo als installierter App-Icon sichtbar. DEBUG-Ansicht belegt, kein Release-Nachweis. `Smoke/` enthält den reproduzierbaren Test.
- Drei anonyme HTTPS-GETs an Mobile-API erfolgreich (HTTP 200); kein produktiver Schreibzugriff. `https-read-check.txt`.
- Lesender zweiter Agent hat den fixierten Code-Stand auf konkrete Fehler geprüft: keine weiteren belegten Fehler; keine eigenen Tests durch diesen Agenten.

## Offene Anforderungen / Merge-Gates

Die offenen Checkboxen sind nicht als erfolgreich ausgegeben:

- 1.3/6.4/7.3: Modelle und iOS-Versionen unbekannt, Installation auf realem Gerät offen; Deployment-Target bleibt 18.5.
- 3.2: Upsell-Code ist an allen Eingängen und beim Ereignisversand gesperrt; DEBUG-Netznachweis über eine vollständige Tour bleibt offen, bis der Tour-Ablauf auf dem integrierten Stand geprüft werden kann.
- 4.2, Alt 3.2: geteilter Decoder implementiert und in Produkt-/Rezept-/Upsell-/Transfer-Code verwendet. BeaconManager-Layoutdecoder nicht angefasst, weil dieser Teil Erik gehört.
- 5.1/5.2: A-eigene Einstellungen und Texte angepasst. StoreMapPage enthält weiter Release-sichtbare Debug-/Layout-Steuerungen und Entwicklervokabular; Erik muss diese Stellen bearbeiten oder freigeben. Der „Ohne Ortung“-Default verwendet den vorhandenen Modus debugNoBeacons; dessen Karten-Debug-Darstellung muss Erik passend abgrenzen.
- 5.6, Alt 6.1–6.4: address/source/fallback im Modell ergänzt und Alt 10.x erledigt; die Filialübersicht enthält weiterhin erfundene Koordinaten und den alten Titel. Änderung an StoreMapPage bleibt Eigentums-Gate.
- 6.5: Löschung der vier alten Views ohne Eriks explizite Freigabe nicht ausgeführt. SearchOverlayView ist lediglich auf die neue Suche migriert.
- 6.3/7.2: vollständiger Request-Mix, Release-artige Einstellungen, wiederholter Erststart/Help und Bluetooth-Aus/Standort-Verweigerung noch manuell abzunehmen. Keine reale Beacon-/AR-Genauigkeit geprüft.

Keine neuen unabhängigen Code-Befunde; wegen der genannten Anforderungen noch nicht merge- oder ausgabereif. Keine Backend-Tests, keine Deployments.
