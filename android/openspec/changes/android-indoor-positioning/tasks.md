## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Algorithmus

- [ ] 2.1 NavigationConfig mit allen Swift-Parametern als dokumentiertes Startprofil übertragen.
- [ ] 2.2 MonotonicClock und BLE-/MotionSample-Domainmodelle erstellen.
- [ ] 2.3 RSSI-Fenster, Sentinelfilter, TxPower-Distanz und Kalman separat implementieren.
- [ ] 2.4 Gewichteten Gauss-Newton-Solver samt Geometrie-/Residualkonfidenz portieren.
- [ ] 2.5 PoseFusionService mit begrenzter Prädiktion und Clock-Injection bauen.
- [ ] 2.6 Displayfilter mit drei Sprungbestätigungen und Staleness-Regel implementieren.

## 3. Android und Zustand

- [ ] 3.1 SensorManager-Adapter mit Rotation-Vector/Acceleration und Display-Achsenmapping erstellen.
- [ ] 3.2 Quality-/Heading-Mapping ohne CoreLocation-accuracy definieren und per Geräteprofil kalibrieren.
- [ ] 3.3 NavigationStateMachine mit Hysterese, Route-Freeze und manuellem Status bauen.
- [ ] 3.4 Store-/Layoutwechsel, Foreground-Ende und Permission-Revoke zentral in Reset-Ereignisse übersetzen.
- [ ] 3.5 Kalibrierungsaktion an Walkable-Snap-Interface anbinden; ungültigen Tap ablehnen.
- [ ] 3.6 Unsicherheitsmarker und nichtfarbliche Statusanzeige an MapUiState liefern.

## 4. Nachweise

- [ ] 4.1 Synthetische Trace-Fixtures mit 0/1/2/3/4 Ankern, Kollinearität und Rauschen erstellen.
- [ ] 4.2 Deterministische Solver-/Kalman-/Fusion-/Clock-Tests gegen erwartete Toleranzen schreiben.
- [ ] 4.3 Stale, Hysterese 0,34→0,54→0,55, Jump und manual reset als Reducer-Tests prüfen.
- [ ] 4.4 Geräte ohne Gyro/Magnetometer und Displayrotation 0/90/180/270 Grad testen.
- [ ] 4.5 D06 Feldmessungen für stationären Jitter, Bewegung, Abschattung und Wiederaufnahme durchführen.
- [ ] 4.6 Profilunterschiede und Abnahmegrenzen in ACCEPTANCE.md mit Messgerätklasse dokumentieren.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
