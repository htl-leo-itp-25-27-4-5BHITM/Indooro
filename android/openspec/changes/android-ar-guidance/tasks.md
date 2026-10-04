## 1. OpenSpec und Startnachweis

- [ ] 1.1 Proposal, Delta-Spec, Design und zugeordnete Matrixfälle vor Implementierungsstart gegen dann aktuellen main prüfen; Änderungen zuerst in Artefakten nachführen.
- [ ] 1.2 Voraussetzungen und Root-/Entscheidungsgates mit Versionsbeleg erfassen; blockierte Fälle ausdrücklich offen lassen und lokale synthetische Fixtures festlegen.

## 2. Plattform

- [ ] 2.1 ARCore-Optional-Manifest und Runtime-Supportstatus samt transientem Prüfen implementieren.
- [ ] 2.2 requestInstall-/Camera-Permission-Ablauf mit Abbruch, fehlenden Services und erneutem Versuch modellieren.
- [ ] 2.3 ARSession-Controller mit Surface-/GL-Lifecycle und Kameraressourcenfreigabe bauen.
- [ ] 2.4 Keine Cloud-/Geospatial-Option aktivieren; Netzwerk-/Manifestprüfung vorsehen.

## 3. Geometrie und UI

- [ ] 3.1 ARMapTransform samt inverse mapping und Händigkeitstests entwickeln.
- [ ] 3.2 Bodenhit-Test und Alignment-Workflow mit Position/Segmentbestätigung umsetzen.
- [ ] 3.3 RouteResampler und PreviewPlanner aus unveränderter Route portieren.
- [ ] 3.4 Marker-/Breadcrumb-Pool mit 120er-Grenze, Abstandsculling und framerateunabhängiger Glättung bauen.
- [ ] 3.5 HUD für Tracking, nächste Distanz, Recalibration und 2D-Zurück integrieren.
- [ ] 3.6 Store-/Layout-/Pose-Generation in AR invalidieren; Low-confidence-Marker unterdrücken.

## 4. Nachweise

- [ ] 4.1 Transform-Roundtrip, 90-Grad-Drehung und L-/U-Routen ohne Eckenschnitt testen.
- [ ] 4.2 Preview 4,5 m, maximal drei Waypoints und Poollimit mit langen Routen prüfen.
- [ ] 4.3 Unsupported-/Install-abgelehnt-/Kamera-verweigert-UI auf passenden Geräten ausführen.
- [ ] 4.4 Resume, Kamera durch andere App belegt und Sensor-Revoke testen.
- [ ] 4.5 Reale texturarme Böden, Lichtwechsel und 20-m-Bewegung für Drift/Framezeit messen.
- [ ] 4.6 2D/AR-Routenidentität und keine Frame-/Anchor-Uploads in kontrolliertem Netzwerk nachweisen.

## 5. Dokumentation, Abnahme und Einführung

- [ ] 5.1 Die in design.md genannten Modul-/Dateigrenzen sowie API-/Datenformatänderungen und Plattformabweichungen dokumentieren; Matrix und T-P-Nachweise aktualisieren.
- [ ] 5.2 Change-spezifischen Migrations-/Rollbackpfad aus design.md mit synthetischen Bestandsdaten oder zustandslosem Feature-Abschalten prüfen; keine destruktive Datenrücksetzung.
- [ ] 5.3 Alle Delta-Szenarien und zugeordneten Paritätsfälle abnehmen; Sanitized-Protokolle mit Build/OS/Geräteklasse beilegen, Rootgates nicht durch Mock-Erfolg ersetzen.
- [ ] 5.4 Aus android/ OpenSpec 1.3.1 validate --all --strict ausführen; Root separat validieren; späteren Pilot-/Releaseübergang mit A12 abstimmen, ohne ungeprüfte Backendänderungen.
