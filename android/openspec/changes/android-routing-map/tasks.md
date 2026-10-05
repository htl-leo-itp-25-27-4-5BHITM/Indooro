## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Graph und Ziele

- [ ] 2.1 Meter-Polygonmodell und gemeinsame Rotation um Elementzentrum implementieren.
- [ ] 2.2 Grid-Belegung mit Rand-/Segmentintersektion und dokumentierter Walkability erstellen.
- [ ] 2.3 Heap-A* mit deterministischer Knotenordnung und Unreachable-Resultat portieren.
- [ ] 2.4 Graphcache an Store-ID/Layoutrevision/Geometrieprofil binden.
- [ ] 2.5 ShelfApproachResolver mit expliziter Regalnähe und D05-Strategieinterface bauen.
- [ ] 2.6 Kollisionsprüfung für Route-Polyline und verbotene Glättungsabkürzungen ergänzen.

## 3. Stabilität und UI

- [ ] 3.1 MapMatcher mit Kanten-, Heading-, Kontinuitäts- und Routengewichten portieren.
- [ ] 3.2 RouteManager mit Hold, Cooldown, Segmentlock und Confidence-Freeze implementieren.
- [ ] 3.3 MapViewport für Fit/Zoom/Pan/Tap-Meterkoordinaten bauen.
- [ ] 3.4 Canvas-Layer für Regale, Route, Ziel, Stopps, Nutzer und Debugdaten erstellen.
- [ ] 3.5 Zielkarte mit Name, Preis, Gang/Regal, Distanz, Start/Einplanen/Schließen verbinden.
- [ ] 3.6 Tourpanel und zugängliche Stopp-/Routenbeschreibung samt Position-setzen-Aktion integrieren.

## 4. Nachweise

- [ ] 4.1 A*-Optimalität auf kleinen Referenzgraphen und getrennten Komponenten testen.
- [ ] 4.2 45-/90-Grad-Regale, enge Gänge, unbekannte Typen und blockierten Start prüfen.
- [ ] 4.3 MapTransform-Roundtrip bei allen Zoomgrenzen und Fenstergrößen testen.
- [ ] 4.4 Offroute-Grenzen 5,9/6,0 s, Cooldown 19,9/20 s und Low-confidence-Replay testen.
- [ ] 4.5 25-Stopps-/40x30-m-Benchmark mit Graphbauzähler und UI-Frame-Messung ausführen.
- [ ] 4.6 Reale Regalnähe ohne Wandquerung und zugängliche Bedienung im Pilot abnehmen.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
