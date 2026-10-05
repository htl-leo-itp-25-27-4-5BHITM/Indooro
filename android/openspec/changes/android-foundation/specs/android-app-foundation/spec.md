## ADDED Requirements

### Requirement: Five primary destinations preserve user intent
The Android shell SHALL expose Start, Planung, Rezepte, Einkaufen and Karte, preserving each destination back stack and selected list.

#### Scenario: Tabwechsel
- **GIVEN** eine Rezeptdetailseite ist offen
- **WHEN** Planung und danach Rezepte gewählt werden
- **THEN** kehrt dieselbe Rezeptdetailseite zurück; die ausgewählte Liste bleibt erhalten

#### Scenario: Back
- **GIVEN** ein Sheet liegt über der Indoor-Karte
- **WHEN** System-Zurück betätigt wird
- **THEN** schließt zuerst das Sheet, dann die Indoor-Ansicht zur Filialübersicht, ohne die Tour zu löschen

### Requirement: Home and tutorial remain functional
The home screen SHALL show the current list summary, active tour banner when applicable, planning/recipe/map entry actions and a dismissible tutorial.

#### Scenario: Start
- **GIVEN** eine aktive Tour mit nächstem Stopp besteht
- **WHEN** Start geöffnet wird
- **THEN** zeigt die Tourkarte Liste, nächsten Stopp und Fortsetzen-Aktion

#### Scenario: Tutorial
- **GIVEN** das Tutorial ist offen
- **WHEN** Planung gewählt wird
- **THEN** schließt das Tutorial und öffnet Planung ohne Listenmutation

### Requirement: State survives recreation with explicit ownership
The shell MUST restore small navigation state after recreation and reload durable data from repositories; sensor poses and AR sessions SHALL be reacquired.

#### Scenario: Rotation
- **GIVEN** Suchtext, Liste und Rezept-ID sind gesetzt
- **WHEN** die Activity neu erstellt wird
- **THEN** bleiben Suchtext und IDs erhalten und kein Hinzufügen wird erneut ausgeführt

#### Scenario: Prozesstod
- **GIVEN** eine Tour ist gespeichert
- **WHEN** der Prozess beendet und neu gestartet wird
- **THEN** wird die Tour als fortsetzbar geladen, aber keine alte Position als frisch angezeigt

### Requirement: Configuration is environment specific
The build SHALL separate demo, development and production endpoints, keep production HTTPS-only and prohibit embedded credentials and debug simulation in release.

#### Scenario: Release
- **GIVEN** ein Release-Build wird geprüft
- **WHEN** das Manifest und UI untersucht werden
- **THEN** existieren keine Cleartext-Ausnahme, Diagnose-Beacons oder Backend-Schreibwerkzeuge

#### Scenario: Demo
- **GIVEN** keine Berechtigungen wurden gewährt
- **WHEN** der explizite Demo-Modus startet
- **THEN** funktionieren synthetische Navigation und Listen ohne laufende API

### Requirement: Native design preserves accessible content
Compose screens SHALL preserve the iOS information hierarchy using native controls, scalable text, light/dark colors and adaptive phone/tablet navigation.

#### Scenario: Große Schrift
- **GIVEN** Systemschrift steht auf 200 Prozent
- **WHEN** ein Produkt mit langem Namen angezeigt wird
- **THEN** bleiben Name und Aktionen lesbar und erreichbar ohne Überlappung
