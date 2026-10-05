## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Format und Validierung

- [ ] 2.1 V1-Kodierer/Decoder inklusive exakter sourceListID/productID-Schreibweise, Ganzsekunden-UTC-Exportdatum, UUID, Kind, Status, Mengen und nullable Metadata implementieren.
- [ ] 2.2 Synthetische Swift-kompatible Golden-Dateien und Android→iOS→Android-Vergleiche erstellen.
- [ ] 2.3 v1-Ausschlussregeln, Anzahl/Größe/Stringgrenzen und fehlenden Storebezug in Vorschau zeigen.
- [ ] 2.4 Bounded Streamreader und Validator für MIME/Schema/Version/Zahlen/UTF-8 entwickeln.

## 3. Android und Transaktion

- [ ] 3.1 FileProvider mit engem cache/exports-Pfad, read grants und sanitized Namen konfigurieren.
- [ ] 3.2 ACTION_SEND, CREATE_DOCUMENT, OPEN_DOCUMENT und selektiven VIEW-Import integrieren.
- [ ] 3.3 PendingTransfer-Snapshot und Importledger in Room versioniert speichern.
- [ ] 3.4 Auswahl Alle/Keine sowie Teilmengen 1..Bestand und Kopie/Aus Liste senden umsetzen.
- [ ] 3.5 Explizite Entnahmebestätigung nach Sharesheet mit Revision-/Mengenvergleich implementieren.
- [ ] 3.6 Importvorschau Neue Liste/Merge/Abbrechen mit atomarer A07-Mutation verbinden.
- [ ] 3.7 24-h-Tempcleanup ohne vorzeitiges Löschen aktiver Transfers implementieren.

## 4. Nachweise

- [ ] 4.1 Cross-platform v1-Felder, ISO-Datum, Notizen, Status und Reihenfolge byte-/semantisch prüfen.
- [ ] 4.2 Grenzen 0/1/1000/1001 Items, 2-MiB-Überschreitung, unknown version und kaputtes JSON testen.
- [ ] 4.3 Maliziösen Dateinamen, unlesbaren Provider, fehlendes URI-Recht und MIME-Fallback prüfen.
- [ ] 4.4 Chooser cancel/return, Doppeltap-Entnahme und veränderte Quellmenge als UI-Tests ausführen.
- [ ] 4.5 Rotation/Prozesstod während Staging, Preview und nach DB-Commit testen.
- [ ] 4.6 Reales Android↔iOS-Teilen über Datei/Cloudanbieter mit synthetischen Listen abnehmen.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
