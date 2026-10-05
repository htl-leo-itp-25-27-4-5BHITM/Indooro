## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Repository und Anzeige

- [ ] 2.1 RecipePage-/Detail-/Mapping-DTOs und Unknown-Mappingstate anlegen.
- [ ] 2.2 Getrennte RequestKeys und Cancel-/Generation-Prüfung für Liste/Detail/Mapping implementieren.
- [ ] 2.3 Seiten 0/20 und load-more samt query-reset ohne Duplikate bauen.
- [ ] 2.4 RecipeListScreen mit Suche, Pull-to-refresh und leeren/fehlerhaften Zuständen erstellen.
- [ ] 2.5 RecipeDetailScreen mit Bildplatzhalter, Portionen, Zeiten, Tags, Zutaten und Schritten bauen.
- [ ] 2.6 Begrenzte Textnormalisierung, Einheitenformatierung und Mengenpräfixbereinigung mit Fixtures übertragen.

## 3. Mapping und Übernahme

- [ ] 3.1 Mappingbadges für alle fünf Zustände plus Unknown implementieren.
- [ ] 3.2 Storewechsel invalidiert Mapping, während allgemeine Rezeptinhalte erhalten bleiben.
- [ ] 3.3 Zutaten-/Listenauswahl mit Vorauswahl, freiem Toggle und Vorschau umsetzen.
- [ ] 3.4 RecipeToListUseCase als transaktionalen A07-Aufruf mit Quelle, Menge, Einheit und confidence bauen.
- [ ] 3.5 Navigation zur Einkaufsliste und aktive Tourneuberechnung nach bestätigtem Commit verbinden.
- [ ] 3.6 Gekennzeichneten Cache-Leseweg und explizite freie Offlineübernahme implementieren.

## 4. Nachweise

- [ ] 4.1 Mapping-Fixtures für alle Zustände, null Produktfelder und unbekannte Enums testen.
- [ ] 4.2 Produktduplikat, freie gleiche Zutat im gleichen/anderen Rezept und Notizmerge prüfen.
- [ ] 4.3 Keine Paketzahloptimierung aus Gramm/Portionen als Regression absichern.
- [ ] 4.4 UI-Tests keine Zutat/Abbruch/fehlende Liste und Storewechsel im offenen Sheet durchführen.
- [ ] 4.5 R-AD-Datenverlustfixture mit fehlendem Bild/Tags sowie Server-404/Offline prüfen.
- [ ] 4.6 Rezept→Liste→Tour inklusive ungeklärter Zutat im Pilottest abnehmen.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
