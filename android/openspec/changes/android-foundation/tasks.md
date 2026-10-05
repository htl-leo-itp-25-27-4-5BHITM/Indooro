## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Projekt und Grenzen

- [ ] 2.1 D01 Toolchain-Kompatibilitätsmatrix mit exakten stabilen Versionen, JDK und Wrapper-Checksum festhalten.
- [ ] 2.2 Gradle Kotlin DSL, Version Catalog und die in design.md genannten Module anlegen; keine Root-Builddateien überschreiben.
- [ ] 2.3 Convention-Plugins für Compile-/Target-/Min-SDK und getrennte demo/dev/prod Buildkonfigurationen einrichten.
- [ ] 2.4 Hilt-Bindings für Repository-, Clock-, Dispatcher- und Sensor-Interfaces erstellen; Test-Doubles in :core:testing.
- [ ] 2.5 Abhängigkeitsregel feature→domain/core und Verbot gegenseitiger Feature-Imports automatisiert prüfen.

## 3. Shell und UI

- [ ] 3.1 MainActivity und typisierte Hauptdestinationen mit eigenem Backstack je Tab erstellen.
- [ ] 3.2 Deep-Entry-Routing für Produktfokus, Tourstart und Importvorschau mit eindeutigen Event-IDs entwerfen.
- [ ] 3.3 HomeScreen mit Listenstatistik, Tourbanner und allen vier Einsprüngen bauen.
- [ ] 3.4 TutorialSheet samt Schließen/Planung/Karte-Aktionen und Wiederöffnung umsetzen.
- [ ] 3.5 Designsystem für Farbe, Typografie, Abstände, Karten, Buttons, Zustandsflächen und Light/Dark definieren.
- [ ] 3.6 NavigationRail bei großem Fenster und NavigationBar bei kleinem Fenster sowie Insets/IME berücksichtigen.
- [ ] 3.7 Deutsche String-/Plural-Ressourcen anlegen; keine fachlichen Texte im Composable hardcodieren.

## 4. Zustand und Nachweise

- [ ] 4.1 SavedStateHandle/Saveable-State nur für Suchtext, Filter und IDs einsetzen; keine Layout-Blobs in Bundles.
- [ ] 4.2 StoreContext-Generation und App-Orchestrierung als injizierbaren Vertrag definieren.
- [ ] 4.3 Compose-Tests für fünf Tabs, Tutorial-Einstiege und Zurück-Reihenfolge erstellen.
- [ ] 4.4 Recreation-/Prozesstod-Test für Rezeptdetail und Import-Einstieg ausführen; Doppelaktionen ausschließen.
- [ ] 4.5 Screenshot-Abnahme für kleines Telefon, Tablet, Light/Dark und 200-Prozent-Schrift dokumentieren.
- [ ] 4.6 Demo ohne Netz und verweigerte Berechtigungen prüfen; Release-Konfiguration gegen Debug-Leaks testen.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
