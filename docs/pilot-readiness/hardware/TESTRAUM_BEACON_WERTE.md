# Testraum SPAR-Leonding-002: abgelesene Beacon-Werte

Status: leere Vorlage. Hier stehen nur Werte, die jemand am echten Gerät abgelesen hat. Nichts raten, nichts aus dem Layout abschreiben.
Wozu: `scripts/field/check_testroom_beacons.sh --values docs/pilot-readiness/hardware/TESTRAUM_BEACON_WERTE.md` vergleicht diese Werte mit dem, was im Admin eingetragen ist. Anleitung zum Eintragen: `ADMIN_BEACONS_EINTRAGEN.md`.

## So füllen Sie die Tabelle aus

Lesen Sie jedes Beacon mit der Herstellerapp ab (siehe `CONFIGURE_BEACON.md`). Ein Beacon pro Zeile. Fehlt ein Beacon, ergänzen Sie eine Zeile im Block unten.

| Feld | Bedeutung |
| --- | --- |
| Etikett | Das, was auf dem Gerät oder dem Aufkleber steht, zum Beispiel `IND-1-1` (siehe `BEACON_STANDARD.md`, Abschnitt 4). |
| Zelle (x,y) | Die Rasterzelle im Layout, in der das Beacon liegt, als `x,y` ohne Leerzeichen (zum Beispiel `5,9`). Das sind Layout-Rasterwerte, nicht Meter; sie stehen im Layout Editor beim Beacon. Der Wert muss zur Position im Raum passen (mit dem Maßband gegenprüfen). |
| UUID | Die lange Kennung aus der Herstellerapp, mit oder ohne Bindestriche, genau so wie angezeigt. |
| Major | Die erste Zahl der Kennung (Standortnummer), aus der Herstellerapp. |
| Minor | Die zweite Zahl der Kennung (Beacon-Nummer), aus der Herstellerapp. |
| Admin-Name | Der Name, unter dem das Beacon im Admin heißt (Spalte „Code“ bei Beacons), zum Beispiel `Indooro1`. |
| TX-Leistung | Die in der Herstellerapp eingestellte Sendeleistung in dBm (zum Beispiel `-12`), oder `?` wenn unbekannt. |
| Gelesen von / Datum | Wer abgelesen hat und wann, zum Beispiel `Erik 2026-11-20`. |

## Werte (vom Skript gelesen)

Format je Zeile, getrennt mit Strichpunkt: `Etikett;x,y;UUID;Major;Minor;Admin-Name;TX-Leistung;Gelesen von / Datum`. Zeilen mit `#` am Anfang werden ignoriert. Solange UUID, Major und Minor leer sind, gilt eine Zeile als „nicht abgelesen“ und das Skript meldet einen Blocker.

```beacon-werte
# Etikett;x,y;UUID;Major;Minor;Admin-Name;TX-Leistung;Gelesen von / Datum
;5,9;;;;Indooro1;;
;5,0;;;;Indooro2;;
;0,0;;;;Indooro3;;
;0,9;;;;Indooro4;;
```

Zellen und Admin-Namen in den Zeilen oben sind der Stand des Layouts vom 2026-11-19. Stimmen sie nicht mit dem Raum überein, ändern Sie sie auf das, was wirklich im Raum hängt. Das Skript meldet dann den Unterschied zum Layout.
