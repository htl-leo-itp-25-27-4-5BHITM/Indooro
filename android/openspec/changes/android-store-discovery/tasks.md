## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Store und Karte

- [ ] 2.1 StoreRepository und StoreContext mit selected/detected/activeLayout und Generation definieren.
- [ ] 2.2 StoreSummary-Mapper für address und nullable Koordinaten sowie Bereichsprüfung implementieren.
- [ ] 2.3 StoreListScreen mit Lade-, Leer-, Fehler- und Stale-Cache-Zuständen anlegen.
- [ ] 2.4 D04 Anbieterentscheidung und Schlüsselrestriktionen dokumentieren; MapProvider-Interface und Fake bauen.
- [ ] 2.5 Reale Pins, Fit-to-pins, Reload und Ohne-Kartenposition-Liste umsetzen; keine Stadt-/Hash-Koordinaten.
- [ ] 2.6 Bestätigung des Store-Wechsels bei Tour, manuelle Priorität und Rückkehr zur Übersicht implementieren.

## 3. BLE

- [ ] 3.1 IBeaconAdvertisementParser mit Android-Manufacturer-Offset, signed TxPower und 16-Bit-Grenzen bauen.
- [ ] 3.2 BluetoothLeScanner-Adapter, Filter, CallbackFlow und genau-eine-Scan-Session implementieren.
- [ ] 3.3 Scanfehler, Bluetooth-Aus, fehlende Hardware und Permission-Revoke in Zustände abbilden.
- [ ] 3.4 Lookup-Reducer mit -95-Schwelle, vollständigen Identitätsschlüsseln und 15-s-Cooldown entwickeln.
- [ ] 3.5 Identitätskatalog mit 60-s-Refresh, validem Leerresultat und Stale-Marker verarbeiten.
- [ ] 3.6 matchedBeacon.identityKey gegen Anfrage prüfen und R-DA-Vertragsgate erzwingen.

## 4. Nachweise

- [ ] 4.1 Parser-Fuzz-/Grenztests für truncated, falsche Company-ID, RSSI-Sentinel und Major/Minor 0/65535 ausführen.
- [ ] 4.2 Mock-Lookup 404/409/500 und Racing-Callbacks während manueller Auswahl testen.
- [ ] 4.3 Compose-Test für Auswahl ohne Standortberechtigung und ohne Koordinaten erstellen.
- [ ] 4.4 Reale iBKS-Beacons auf zwei OEM-Geräten mit gleicher UUID und unterschiedlichen Minor-Werten prüfen.
- [ ] 4.5 Start/Stop beim Appwechsel, ausgeschaltetem Bluetooth und Scanfehler auf Gerät protokollieren.
- [ ] 4.6 Anbieterunabhängige manuelle Auswahl im Offline-/No-Play-Services-Fall abnehmen.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
