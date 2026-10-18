# Beacon konfigurieren und Identität prüfen

Status: Entwurf (Task 2.5). Die Herstellerapp ist noch nicht festgelegt (`HARDWARE_SELECTION.md`). Die Schritte 1 bis 3 gelten für jede Herstellerapp. Konkrete Menüpunkte werden nach der Auswahl ergänzt (Mensch).

Grundlage: `BEACON_STANDARD.md`. Die Projekt-UUID ist `B5CAA23B-BB89-4040-99D2-FCED3EA4A62B`.

## Voraussetzungen

- iPhone mit iOS und installierter Herstellerapp (Mensch: App nach Modellauswahl festlegen).
- Eine Zeile in `beacons.csv` mit der geplanten Minor-, Major- und Standortnummer.
- Neue Batterie eingelegt.
- Für Schritt 5 (Log-Prüfung): Mac mit Xcode und DEBUG-Build der Indooro-App (Mensch: Erik oder Person A). Die Prüfung über den Herstellerscanner (Schritt 4) ist auch ohne Mac möglich.

## Schritte

1. Beacon in der Herstellerapp suchen. Nur den neuen Beacon in der Nähe halten (etwa 1 m), damit kein anderer Beacon die Auswahl stört.
2. Konfiguration setzen:
   - UUID: `B5CAA23B-BB89-4040-99D2-FCED3EA4A62B` (nicht ändern, siehe `BEACON_STANDARD.md`, Abschnitt 1)
   - Major: Standortnummer (1, 2 oder 10 und höher)
   - Minor: nächste freie Minor aus `beacons.csv`
   - Sendeleistung: Startwert laut `BEACON_STANDARD.md`, Abschnitt 3 (Dry-Run offen)
   - Sendeintervall: 500 ms (Startwert)
3. Änderungen speichern und den Beacon neu scannen. Die gespeicherten Werte mit Schritt 2 vergleichen.
4. Identität mit dem Scanner der Herstellerapp prüfen. UUID, Major, Minor, Sendeleistung und Intervall müssen mit der Zeile in `beacons.csv` übereinstimmen.
5. Identität in der DEBUG-Indooro-App prüfen (siehe Abschnitt „Log-Schlüssel“).
6. Batterie-Datum in `beacons.csv` eintragen (Spalte `battery_date`, Format `JJJJ-MM-TT`).
7. Etikett erstellen und am Gehäuse anbringen. Format: `IND-<major>-<minor>`, zum Beispiel `IND-2-3`.
8. Montage nach `BEACON_STANDARD.md`, Abschnitt 5 (Mensch).
9. Die Zeile in `beacons.csv` vollständig machen (Montagehöhe, Montageort, Koordinaten nach der Messung).

## Log-Schlüssel der DEBUG-App

Die Indooro-App schreibt Scan-Meldungen in das Debug-Protokoll. Jede Meldung wird zusätzlich per `print` in die Xcode-Konsole ausgegeben (`BeaconManager.swift:1068`). Der Schlüssel dient nur zur Drosselung gleicher Meldungen. Gesucht wird der Meldungstext.

| Meldungstext (Anfang) | Drosselungsschlüssel | Fundstelle | Bedeutung |
| --- | --- | --- | --- |
| `iBeacon Manufacturer erkannt uuid=… major=… minor=… rssi=…` | `ibeacon-<uuid>` (alle 2 s) | `BeaconManager.swift:2274–2275` | Advertisement mit iBeacon-Herstellerdaten gefunden (Scan-Pfad) |
| `iBeacon geranged uuid=… major=… minor=… rssi=…` | `ranged-ibeacon-<uuid>` (alle 2 s) | `BeaconManager.swift:947–948` | Beacon durch CoreLocation-Ranging gefunden |
| `iBeacon passt zu keinem Beacon im aktiven Layout uuid=… major=… minor=…` | `ibeacon-no-layout-match-<uuid>` (alle 5 s) | `BeaconManager.swift:2294–2295` | Beacon wird gesendet, passt aber zu keinem Layout-Eintrag. Layout oder Etikett prüfen |
| `ManufacturerData nicht als iBeacon erkannt …` | `manufacturer-not-ibeacon` (alle 5 s) | `BeaconManager.swift:2301` | Fremdgerät oder anderes Format |

Der Wert `<uuid>` im Schlüssel ist die UUID in Kleinbuchstaben ohne Bindestriche (`BeaconManager.swift:2462–2463`). Für die Projekt-UUID lautet der Schlüssel:

```text
ibeacon-b5caa23bbb89404099d2fced3ea4a62b
```

Die Meldungen `uuid=` und `major=`/`minor=` werden im Text in der Schreibweise der App ausgegeben. Die UUID steht dort also ohne Bindestriche und in Kleinbuchstaben.

## Abnahme der Identität

Ein Beacon gilt als korrekt konfiguriert, wenn alle Punkte erfüllt sind:

- [ ] Herstellerscanner: UUID, Major, Minor, Sendeleistung und Intervall stimmen mit `beacons.csv` überein.
- [ ] DEBUG-Log: Meldung `iBeacon Manufacturer erkannt uuid=b5caa23bbb89404099d2fced3ea4a62b major=<Standort> minor=<Minor>` erscheint mit den erwarteten Werten.
- [ ] DEBUG-Log: Für diesen Beacon erscheint keine Meldung „passt zu keinem Beacon im aktiven Layout“. Sonst stimmen Layout oder Etikett nicht.
- [ ] `beacons.csv`: Zeile vollständig, Batterie-Datum eingetragen.
- [ ] Etikett `IND-<major>-<minor>` angebracht.

## Hinweise

- Die Herstellerapp zeigt nur, was der Beacon sendet. Ob die App den Beacon dem Layout zuordnet, zeigt erst die DEBUG-Prüfung.
- Ein Beacon mit fremder UUID wird im Log trotzdem als iBeacon erkannt, aber mit dem Schlüssel `ibeacon-no-layout-match-<uuid>` gemeldet, weil er zu keinem Layout-Eintrag passt.
- Die Log-Prüfung erfordert einen Mac mit Xcode und einen DEBUG-Build (Mensch: Erik oder Person A).
