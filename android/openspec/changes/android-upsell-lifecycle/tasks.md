## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Lifecycle

- [ ] 2.1 CanonicalShoppingState mit open precedence, Sortierung und Deduplikation implementieren.
- [ ] 2.2 OpportunityIdentity inklusive Session/Store/Trigger und normalisierter Stationsquelle festlegen.
- [ ] 2.3 Cache-/Handled-/Pending-State als testbaren Reducer unabhängig vom UI bauen.
- [ ] 2.4 Session-Handled-/Zählerpersistenz in A07-DB mit schema migration ergänzen.
- [ ] 2.5 Single-flight-Planpreload mit autorisiertem Store und Requestgeneration implementieren; 80/81 Opportunities, 20/21 Trigger und R-SH-Listenlimits ohne automatische Splitrequests testen.
- [ ] 2.6 Cacheexpiry und LoadedEmpty/filtered-empty als terminalen Erfolg behandeln.

## 3. Prompts und API

- [ ] 3.1 Station-/Itemopportunities nach transaktionalem Completion-Event anbinden.
- [ ] 3.2 Pending nur <=30 s und aktuellen Kontext anzeigen; bei Stop/Storewechsel invalidieren.
- [ ] 3.3 Drei-Vorschläge-/0,45-/Zehn-Prompts- und Quellencooldown-Regeln umsetzen.
- [ ] 3.4 Akzeptieren atomar durch A07 mit addedFromUpsell, Doppeltap-Schutz und sofortigem Schließen führen.
- [ ] 3.5 Lokale Dismissals und ehrliche Scope-Beschriftung bis R-B/R-DA/D08 bauen.
- [ ] 3.6 Best-effort shown/accepted/dismissed/suppressed/failed mit null sessionId und minimalem metadataJson senden.
- [ ] 3.7 R-U4 Pre-AI-Retryadapter mit genau einem verzögerten Versuch integrieren; unklare Antworten terminal.

## 4. Nachweise

- [ ] 4.1 Virtuelle-Clock-Tests für 8 s, 30 s, 25-s-Timeout und 1-s-Retry schreiben.
- [ ] 4.2 Fünf bis zehn unterschiedliche Stationen sowie elften Prompt und Quellenwechsel testen.
- [ ] 4.3 Reopen/recomplete, leerer Erfolg, TTL-Ablauf, Cacheverbrauch und Prozessrestart ohne Neuanfrage prüfen.
- [ ] 4.4 R-B-Grenzen 1/30/1440/43200 sowie R-DA-Effekt nur im lokalen Testbackend verifizieren.
- [ ] 4.5 AI-empty/429/Timeout/invalid JSON/candidate failure mit exakter Requestzahl testen.
- [ ] 4.6 Release-Logs und Payloads auf fehlende Position/Identität/Notizen prüfen; D08-Freigabe dokumentieren.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
