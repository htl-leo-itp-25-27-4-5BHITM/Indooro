## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Datenmodell

- [ ] 2.1 Room v1 Tabellen für Listen, Items und Sessions mit Foreign Keys/Indizes erstellen.
- [ ] 2.2 Nullable Produktreferenzen, Rezeptfelder und addedFromUpsell in Domain/DB-Mapper aufnehmen.
- [ ] 2.3 DAO-Transaktionen für add/merge/quantity/status/order und Zeitstempel implementieren.
- [ ] 2.4 DataStore für Auswahl-/Ansichtseinstellungen von fachlicher Session in Room abgrenzen.
- [ ] 2.5 Schemaexport, Recovery-Kopie und Migration ohne destructive fallback einrichten.
- [ ] 2.6 Defaultliste nur bei beweisbar leerer Neuinstallation erstellen; letzte Liste schützen.

## 3. Listen und Tour

- [ ] 3.1 Listenübersicht, Neu-/Umbenennen-/Löschen-Dialoge und Auswahl bauen.
- [ ] 3.2 Offen/Erledigt/Fehlend/Übersprungen, Mengen-/Notizeditor und Umordnen umsetzen.
- [ ] 3.3 StopResolver mit unresolved/unreachable und revidierbarem Snapshot entwickeln.
- [ ] 3.4 Distanzmatrix/nearest-neighbor plus Listenmodus mit stabilen Gleichständen implementieren.
- [ ] 3.5 SessionReducer für start/pause/resume/stop/delete/storeChanged erstellen.
- [ ] 3.6 Idempotente CompleteStop-Aktion mit Stop-ID und erwarteter Revision transaktional verarbeiten.
- [ ] 3.7 Produkt-Einzelfokus und Tourziel-Exklusivität aus A01 integrieren.
- [ ] 3.8 Fortschritt nach Mengen, Stopps erledigt und offene freie Artikel getrennt darstellen.

## 4. Nachweise

- [ ] 4.1 CRUD-/Merge-/Status-/Order-Unit-Tests einschließlich leeren Namen und Menge null/negativ erstellen.
- [ ] 4.2 Room-Transaktionsabbruch, Migration und Prozessende vor/nach Commit prüfen.
- [ ] 4.3 Snapshot-Race und Doppeltap mit virtueller Clock und wechselnder Reihenfolge testen.
- [ ] 4.4 UI-Test Rezept-/Upsell-/Importmutation während aktiver Tour vorbereiten und später integrieren.
- [ ] 4.5 Offline alle lokalen Listenaktionen inklusive Neustart auf Gerät prüfen.
- [ ] 4.6 25 Stopps und häufige Positionsänderungen gegen Rebuild-/Latenzbudget abnehmen.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
