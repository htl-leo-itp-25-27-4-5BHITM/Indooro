## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Layout

- [ ] 2.1 LayoutSnapshot/Provenance und validierende flexible Decoder implementieren.
- [ ] 2.2 Cache-Einträge store/environment/revision-basiert atomar speichern, Datum und formatVersion führen.
- [ ] 2.3 source/fallback auswerten und Demo-/Default-Geometrie von Live-Routen ausschließen.
- [ ] 2.4 Generationswechsel beim Layoutladen testen; nur vollständig validierte Snapshots veröffentlichen.
- [ ] 2.5 Unbekannte Elementtypen konservativ als nicht routbare Hindernisse markieren und Diagnosehinweis erfassen.

## 3. Katalog

- [ ] 3.1 ProductLocationResolver mit Kategorie/effektivem Meter und Ambiguitätsresultat implementieren.
- [ ] 3.2 D03 Root-Vertragsentscheidung inklusive getAllProducts-Limit und Kategorie-Paging dokumentieren.
- [ ] 3.3 PlanningViewModel und MapSearchViewModel mit Schwelle, Debounce, Cancellation und Store-Scope bauen.
- [ ] 3.4 Produktzeilen mit nullable Preis/Position, Einplanen/Noch eins und getrenntem Navigationsstatus bauen.
- [ ] 3.5 13 Kategorieshortcuts und die Namensfilter mit korrekten Reset-Übergängen übernehmen.
- [ ] 3.6 Kontextuelle statische Vorschläge korrekt benennen, Sieben-Zeilen-Vorschau und Alle-Link umsetzen.
- [ ] 3.7 Vertragsbegrenzte Kategorienvorschau kennzeichnen; D03-freigegebenen Adapter erst nach Fixture-Verifikation aktivieren.

## 4. Verifikation

- [ ] 4.1 Layout-Fixtures für Aliase, Stringzahlen, Rotation, leere Elemente und kaputtes Grid testen.
- [ ] 4.2 Offline A-Cache bei Store B, Server-Default und 304 nur mit vorhandenem Cache prüfen.
- [ ] 4.3 Produktresolver gegen 31/310, mehrdeutiges Regal, fehlendes Meter und ungültiges LayoutCode testen.
- [ ] 4.4 UI-Tests für Drei-Zeichen-Schwelle, Submit-Reset, Kategorie-Reset und leere/fehlerhafte Suche erstellen.
- [ ] 4.5 Filialwechsel bei laufender Suche und Schemafehler in nur einem Produkt testen.
- [ ] 4.6 Endgültige Kategorienvollständigkeit mit mehr als 500 Produkten und zwei Stores nach D03 nachweisen.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
