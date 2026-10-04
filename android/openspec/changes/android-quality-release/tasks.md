## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Permissions und Datenschutz

- [ ] 2.1 PermissionCoordinator für API26–30/31+ und Kamera getrennt implementieren.
- [ ] 2.2 Manifest-Rechte und uses-feature required=false für BLE/Kamera/AR prüfen; unnötige Rechte entfernen.
- [ ] 2.3 Grob/präzise, einmalig, dauerhaft verweigert, auto-reset und Bluetooth-Aus modellieren.
- [ ] 2.4 Foreground-Lifecycle-Stop und Freshness-Reset in A03/A05/A08 integrieren.
- [ ] 2.5 Backup/dataExtractionRules für alte/neue Android-Versionen und OEM-Transferpfade testen.
- [ ] 2.6 Lokale Daten löschen mit Bestätigung und sauberem Sensor-/DB-/Export-Stop bauen.
- [ ] 2.7 Datenschutzinformation und redigierte Diagnoseexport-Regel ohne Notizen/Identitäten schreiben.

## 3. Accessibility und CI

- [ ] 3.1 Semantics für Karten-/Stopp-/Produkt-/Rezept-/Transferaktionen und Statusansagen ergänzen.
- [ ] 3.2 TalkBack/Switch Access/200%-Schrift/48dp/Light-Dark-Kontrast manuell prüfen.
- [ ] 3.3 Android-CI mit Unit, Lint, Migration, Mock API, Compose-Geräten und Release-Smoke konfigurieren.
- [ ] 3.4 Getrennte Root- und Android-OpenSpec-Validierung sowie Link-/Traceability-Prüfung hinzufügen.
- [ ] 3.5 Dependency verification/Locking, SBOM-/Lizenzprüfung und Secret-Scan ohne Wertausgabe einrichten.
- [ ] 3.6 Screenshot-/Benchmark-Artefakte mit Build-/OS-/Geräteklasse statt persönlichen Kennungen speichern.

## 4. Geräte und Release

- [ ] 4.1 ACCEPTANCE.md-Gerätematrix mit mindestens zwei OEMs und AR-/Nicht-AR-Gerät durchführen.
- [ ] 4.2 Feldtest 0/1/2/3+ Beacons, Abschattung, Nachbarfiliale, Offline und Storewechsel protokollieren.
- [ ] 4.3 R-SC/R-SH/R-B/R-DA/R-U4 und D03/D05/D08 Freigaben mit Belegen prüfen.
- [ ] 4.4 Signing/App-ID/VersionCode/AAB/R8-Konfiguration im Testtrack qualifizieren; keine Schlüssel ins Repo.
- [ ] 4.5 Aktuelle Play-Target-/Datensicherheits-/Anbieterpflichten vor Veröffentlichung erneut verifizieren.
- [ ] 4.6 Rollout-Stopp, Forward-fix und DB-kompatible Wiederherstellung als Übung dokumentieren.
- [ ] 4.7 Alle Paritätsfälle mit Belegpfaden abschließen; bekannte Restabweichungen explizit abnehmen lassen.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
