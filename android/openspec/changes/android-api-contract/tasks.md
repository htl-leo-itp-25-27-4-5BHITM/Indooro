## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Vertragsarbeit

- [ ] 2.1 Alle API_CONTRACT.md-Operationen auf Root-OpenAPI und Java-Resource abbilden; Driftliste mit R-SC abstimmen.
- [ ] 2.2 Android-Consumer im künftig gefilterten Root-Vertrag beantragen; keinen eigenen Snapshot als zweite Autorität anlegen.
- [ ] 2.3 Sanitisierte Array/Page-, null-Preis-, UUID-, Datum- und Fehler-Fixtures aus dokumentierten Shapes erstellen.
- [ ] 2.4 DTOs und Domain-Mapper in :core:model/:core:network trennen; unbekannte Enums als Unknown behandeln.
- [ ] 2.5 Flexible Layout-/Store-Decoder nur für belegte Aliase implementieren und fehlerhafte Pflichtfelder ablehnen.

## 3. Transport

- [ ] 3.1 APIEnvironment und URL-Builder mit korrektem Query-Encoding für &, +, # und Umlaute bauen.
- [ ] 3.2 OkHttp/Retrofit zentral konfigurieren; TLS-Systemtrust, HTTPS und hostbeschränkte Debug-Ausnahme.
- [ ] 3.3 ApiResult/ApiFailure mit HTTP, Offline, Timeout, Parse, Cancelled und Partial definieren.
- [ ] 3.4 RequestKey/Generation und coroutine cancellation in Repository-Abfragen einbauen.
- [ ] 3.5 GET-Retry und eigene Timeoutprofile ohne globalen POST-Retry implementieren.
- [ ] 3.6 Retry-After als Sekunden und HTTP-Datum lesen; 429 für A10 zugänglich machen.
- [ ] 3.7 Response-Body-Grenzen und redigiertes Logging festlegen; keine personenbezogenen Debug-Bodies.

## 4. Verifikation

- [ ] 4.1 Mock-Webserver-Vertragstests für jede konsumierte Operation und method/path/query/body ausführen.
- [ ] 4.2 401/403/404/409/429/500, HTML, leerer Body, kaputtes JSON und DNS-/TLS-Fehler prüfen.
- [ ] 4.3 A→B-Antwortrennen und A→B→A mit Generationen testen.
- [ ] 4.4 Nullable Produktliste und Bruchteilsekunden gegen Swift-/Backend-Fixtures prüfen.
- [ ] 4.5 Timeout- und Retry-Zahlen mit virtueller Clock beweisen; Plan-POST bleibt einmalig.
- [ ] 4.6 R-SC-Gate mit eingefrorenem lokalen Testserver vor Produktionsfreigabe dokumentieren.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
