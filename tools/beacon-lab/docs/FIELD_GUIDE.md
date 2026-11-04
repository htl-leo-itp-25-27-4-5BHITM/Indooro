# Anleitung: erste echte Messkampagne mit dem Positioning Lab

Diese Anleitung ergänzt das verbindliche Protokoll `docs/pilot-readiness/hardware/MEASUREMENT_PROTOCOL.md`
(Szenarien S1–S4, Marker, Standzeiten). Sie beschreibt, wie die Daten in den Lab kommen und wie sie belastbar ausgewertet werden.
Das Protokoll hat Vorrang. Bei Widersprüchen gilt das Protokoll, und dieses Dokument wird angepasst.

## 0. Vorab festlegen (vor dem Messtag)

1. **Fragestellung und Metriken festlegen.** Bevor Evaluationsdaten angesehen werden, stehen fest: Metriken
   (Median, P90, P95, Anteil ≤ 2/3/5 m, Ausfallrate, Sprungrate), Fehlschlag-Politik (zählen immer mit),
   Perzentil-Definition (lineare Interpolation, Typ 7), die zu vergleichenden Verfahren und Parameter.
2. **Rollen der Läufe festlegen.** Welche Läufe dienen der Kalibrierung (Pfadverlust-Fit, Fingerprints), welche
   der Evaluation? Die Trennung erfolgt **nach Lauf oder Tag**, nie nach einzelnen Samples, weil aufeinanderfolgende
   RSSI-Werte korreliert sind.
3. **Mindestumfang.** Je Bedingung mindestens 3 unabhängige Läufe und ≥ 100 Schätzungen für P95, ≥ 30 Samples
   je Referenzpunkt bei Standzeiten. Weniger Daten führen zu einer Einstufung als „explorativ“ im Bericht.

## 1. Welche Daten aufzeichnen

| Daten | Pflicht | Wie |
| --- | --- | --- |
| RSSI je Beacon mit Zeitstempel | ja | iOS-Recorder (DEBUG-Build), Einstellungen → Aufnahme |
| Ground Truth (Referenzposition) | ja für Fehlermetriken | Langes Drücken auf der Karte am Marker (Start und Ende jeder Standzeit) |
| Layout mit Beacon-Positionen | ja | `python -I scripts/field/fetch_layout.py --store <code> --out layout.json` |
| Gerätemodell, iOS-Version | ja | Notiz → Lab-Feld „Messgerät“ |
| Bedingungen (Uhrzeit, Kundenaufkommen, Umbauten) | ja | Notiz → Lab-Feld „Versuchsbedingungen“ |
| Beacon-Konfiguration (TX-Power, Intervall) | ja | `docs/pilot-readiness/hardware/beacons.csv` |

## 2. Informationen pro Beacon

`beaconId` (wie im Layout), UUID/Major/Minor, Position in Layout-Einheiten (aus dem Layout), Montagehöhe und Art
(Regal-Stirnseite, Wand, Decke), konfigurierte TX-Power und Advertising-Intervall, Batteriestand am Messtag.
Im Lab unter **Kampagne → Beacons** eintragen bzw. prüfen. Beacons können deaktiviert werden, um Ausfälle zu simulieren.

## 3. Referenzpositionen bestimmen

1. Marker am Boden setzen (Klebeband-Kreuz), Namen `M1…Mn` in Gehreihenfolge.
2. Position jedes Markers **mit Maßband/Laser** von einer Wandecke messen und in Layout-Einheiten umrechnen.
3. **Maßstab bestätigen:** Eine bekannte Strecke (z. B. Regallänge) vor Ort messen und mit dem Layout vergleichen.
   Im Lab unter **Grundriss → Maßstab** `Meter je Layout-Einheit` eintragen und „bestätigt“ setzen, mit Notiz
   („Regal 4: 10,0 m gemessen = 10 LE“). **Ohne Bestätigung zeigt der Lab keine Meter an.**
4. Die Genauigkeit der Referenz (Antippen auf der Karte, typischerweise einige Dezimeter) im Bericht nennen.

## 4. Stationäre Messungen (S1)

- Gerät wie bei normaler Nutzung halten. Pro Marker mindestens 60 s ruhig stehen.
- Lange drücken zu Beginn **und** am Ende der Standzeit am Marker. Zwei gleiche `truth`-Punkte ergeben im Lab
  eine Standzeit („hold“).
- Ein Lauf = eine Datei. Für die Kalibrierung eigene Läufe aufnehmen (z. B. Vormittag), für die Evaluation andere
  (z. B. Nachmittag oder anderer Tag).

## 5. Gehversuche (S2–S4)

- Gleichmäßig gehen (ca. 1 m/s). An jedem Marker kurz lange drücken, während man ihn überquert.
- Der Lab interpoliert zwischen Referenzpunkten **linear** (Annahme: konstante Geschwindigkeit). Je dichter die
  Referenzpunkte, desto kleiner der Fehler dieser Annahme. Für Gehversuche im Lab die Option
  „Referenz: interpolieren“ wählen, für Standzeiten „Standzeit / nächster Punkt“.

## 6. Export aus der App

1. In der App Aufnahme beenden. Dateien liegen in `Documents/NavigationRecordings/` (über Finder/Xcode Devices
   oder die Dateien-App holen).
2. **Anonymisieren:** `python -I scripts/field/anonymize_recording.py roh.jsonl anonym.jsonl`
   (entfernt `shopName` und Stopp-Titel). Nur anonymisierte Dateien weitergeben oder einchecken.

## 7. Import in den Lab

1. `cd tools/beacon-lab && npm ci && npm run dev` → <http://localhost:4317>.
2. **Neue Kampagne** anlegen: Name, Datum, Markt, Gerät, Bedingungen.
3. **Grundriss importieren:** Layout-JSON (aus Schritt 1). Beacons werden aus dem Layout übernommen. Maßstab bestätigen.
4. **Messreihe importieren:** `.jsonl` wählen → Format „Indooro-Aufnahme“ wird erkannt. Art (stationär/Gehversuch)
   und Rolle (Kalibrierung/Evaluation) setzen.
5. **Datenqualität prüfen:** Der Import zeigt Fehler und Warnungen mit Zeilennummern. Unbekannte Beacons, Lücken,
   doppelte Zeilen und Ausreißer prüfen. Blockierende Fehler verhindern die Übernahme.

## 8. Algorithmen vergleichen

1. **Kalibrierung:** Unter „Kalibrierung“ die Kalibrierungsläufe wählen → Pfadverlustmodell (A, n) fitten. R² und
   Residuen-σ prüfen. Werte weit außerhalb typischer Bereiche (A ≈ −55…−75 dBm, n ≈ 1,6…3,5) sind ein Warnsignal
   (falsche Beacon-Positionen, falscher Maßstab), kein Grund, den Fit zu überschreiben.
2. **Vergleich:** Evaluationsläufe wählen, Verfahren und Parameter einstellen, „Vergleichen“. Die Tabelle zeigt
   Kennzahlen je Verfahren **und** auf der gemeinsamen Epochenmenge (nur Epochen, in denen alle Verfahren eine
   Position liefern). Die Ausfallrate steht immer daneben.
3. Glättung (RSSI-Filter, zeitlicher Filter) kann die Sprungrate senken und gleichzeitig Verzögerung erzeugen.
   Deshalb Sprungrate, Lag und Fehler gemeinsam betrachten: **Glättung ist nicht Genauigkeit.**

## 9. Belastbar dokumentieren

- Bericht unter **Bericht** erzeugen → „Drucken / als PDF speichern“ und „HTML herunterladen“, dazu JSON/CSV-Export.
- Den Kampagnen-Export (`.json`-Bundle) zusammen mit den anonymisierten Rohdateien archivieren. Die SHA-256-Hashes
  im Bericht belegen, welche Dateien ausgewertet wurden.
- Interpretation nur im dafür vorgesehenen Feld des Berichts. Zahlen und Hypothesen bleiben getrennt.
- Nie synthetische und echte Läufe in einer Kennzahl mischen. Der Lab kennzeichnet synthetische Daten überall.
- Grenzen nennen: ein Markt, bestimmte Geräte, Tageszeit, Gehgeschwindigkeit, Layoutstand. Die Ergebnisse sind ohne
  Neukalibrierung nicht auf andere Märkte übertragbar.
