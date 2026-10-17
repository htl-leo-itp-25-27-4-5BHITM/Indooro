# Pilot-Build auf einem Team-iPhone installieren

Stand: 2026-10-16 · Person A · `prepare-pilot-ios-build` 6.6

## Vorbereiten

1. Modell und iOS-Version unter „Einstellungen → Allgemein → Info“ ablesen und in `DEVICES.md` eintragen. Keine Seriennummer, Apple-ID oder privaten Gerätenamen dokumentieren. Die Liste ist derzeit noch unbekannt; das bestehende Deployment-Target bleibt 18.5.
2. Den geprüften Branch `pilot/ios-pilot-build` öffnen; für den späteren Studienmodus `pilot/ios-study-mode`. In Xcode `swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj` öffnen, Schema „MCindooroApp“ wählen.
3. iPhone mit Kabel verbinden, Gerät entsperren und dem Mac vertrauen. In Xcode das verbundene iPhone als Ziel wählen. Falls iOS darum bittet: unter „Datenschutz & Sicherheit → Entwicklermodus“ den Entwicklermodus einschalten und den angeforderten Neustart durchführen.

## Signieren und starten – Mensch nötig

1. Unter „Xcode → Settings → Accounts“ mit dem vorgesehenen Apple-Konto anmelden. Zugangsdaten bleiben außerhalb des Repositorys.
2. Im App-Target „Signing & Capabilities“ die automatische Signierung und das passende Team auswählen. Bei kostenlosem Konto ist das die „Personal Team“. Falls die Bundle-ID bereits belegt ist, eine freigegebene lokale Signierungsvariante verwenden; keine Team-Änderung ungeprüft committen.
3. Mit „Run“ installieren. Bei nicht vertrauenswürdigem Entwicklerprofil unter „Einstellungen → Allgemein → VPN & Geräteverwaltung“ dem vorgesehenen Entwickler vertrauen.
4. Bei kostenlosem Apple-Konto läuft das Entwicklungsprofil nach ungefähr sieben Tagen ab; dann erneut aus Xcode installieren. Nicht als dauerhafte Verteilung oder TestFlight ausgeben.
5. In `DEVICES.md` Datum, iOS-Version, Rolle und Installationsergebnis ergänzen. Ein Simulator-Build ersetzt diesen Schritt nicht.

## Profile

- `Info.plist`: `IndooroFeatureProfile = pilot` ist der Pilotstandard. Rezepte und AR sind ausgeblendet; Upsell-Anfragen sind gesperrt. Der vollständige Code bleibt vorhanden.
- Im DEBUG-Build: „Karte → Einstellungen → Debug → Funktionsprofil“. „Pilot“ oder „Vollständig“ schaltet die Ansicht um; „Aus Build“ verwendet den Info.plist-Wert. Bei unvollständigen Integrations-Gates ist der Build noch nicht zur Ausgabe an Testpersonen freigegeben.
- `IndooroAPIBaseURL` darf leer bleiben; dann gilt die zentrale HTTPS-Adresse aus `AppEnvironment`. DEBUG kann über die Xcode-Schema-Umgebungsvariable `INDOORO_API_BASE_URL` eine gültige URL mit Pfad `/api` setzen, etwa `https://127.0.0.1:1/api`, um einen Verbindungsfehler zu prüfen. Kein Secret eintragen.

## Abnahme auf dem Gerät

Frischinstallation und Einführung prüfen; zunächst „Ohne Ortung“ verwenden. Erst beim bewussten Umschalten auf „Mit Ortung“ dürfen Standort/Bluetooth angefragt werden. Standort verweigern und den Link „Einstellungen öffnen“ prüfen; Bluetooth ausschalten und Banner prüfen. Vor dem Pilot die noch offenen Freigaben und Prüfungen in `STATUS.md` beachten. Keine reale Beacon-Genauigkeit aus dem erfolgreichen Build ableiten.
