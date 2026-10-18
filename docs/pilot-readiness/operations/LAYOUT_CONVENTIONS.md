# Layout-Konventionen für Pilotmärkte

Stand: 2026-10-17 · Grundlage: OpenSpec `prepare-pilot-store-operations` (Aufgabe 2.1), Spec `store-layout-management` („Layout grid and scale are explicit“) und die Pilot-Regel „Pilot store layouts follow documented conventions“.

Diese Regeln gelten für jedes Layout, das in einem Pilot verwendet wird. Ein Layout wird erst aktiviert, wenn alle Regeln erfüllt sind. Die Bereitschaftsseite prüft einen Teil davon automatisch (siehe Abschnitt 7).

---

## 1. Maßstab

- **1 Zelle = 1 Meter.** Die Layout-Koordinaten `x` und `y` und die Maße `width` und `height` sind in Zellen angegeben, also in Metern.
- Der Grund: Die Beacon-Koordinaten werden in Metern eingetragen, und die Positionsberechnung vergleicht Beacon-Abstände direkt mit den Layout-Koordinaten. Ohne den Maßstab 1 Zelle = 1 m stimmt die Ortung nicht.
- `gridSize` (Felder `width` und `height`) ist die Größe des Marktbereichs in Metern. Die Bereitschaftsprüfung hält Werte zwischen 5 und 200 m für plausibel.
- Beacon-Positionen werden auf etwa 0,5 m genau gemessen (Spec `beacon-deployment`, Abschnitt „Beacon configuration is recorded per site“).

## 2. Eingang

- Genau **ein** Element mit `type: "entrance"`.
- Der Eingang ist der Startpunkt der Führung. Ohne Eingang ist keine Route vom Eingang möglich.
- Fehlt der Eingang oder gibt es zwei, meldet die Bereitschaftsseite das (Abschnitt 7). Der Konverter für Produktdaten gibt dafür nur eine Warnung aus.

## 3. Regalbeschriftung

Jedes Regal, das ein Produkt-Ziel ist, hat `type: "shelf"` und diese drei Felder:

| Feld | Inhalt | Beispiel |
|---|---|---|
| `category` | `<Kategorie>/<Meter>` (Kategorie ist eine interne Zahl) | `520/1` |
| `meter` | Meter als ganze Zahl, gleich dem Teil nach dem `/` in `category` | `1` |
| `label` | Kundentext im Format `Gang <n> · <links\|rechts> · <Warengruppe>` | `Gang 1 · links · Milchprodukte` |

Hinweise:

- Das Trennzeichen im `label` ist ein Mittelpunkt mit Leerzeichen davor und danach (`·`). Groß- und Kleinschreibung zählt beim Zuordnen der Produktdaten.
- Der Kunde sieht das `label`. Die Kategorie-Zahl (`520/1`) sieht er nicht. Ein Regal mit Kategorie als Kundentext ist ein Fehler (siehe 03, Blocker K3).
- `<n>` ist die Gangnummer. `links` oder `rechts` bezeichnet die Regalseite.
- Die Warengruppe steht als Text am Ende.

**Offene Festlegung (Mensch: bestätigen, bevor Regaletiketten gedruckt werden):**
Vorschlag für die Bedeutung von `links` und `rechts`: Die Gänge werden vom Eingang aus in Blickrichtung nummeriert, beginnend mit Gang 1 an der Seite, an der man zuerst vorbeikommt. `links` ist das Regal auf der linken Seite, wenn man vom Eingang aus in den Gang hineingeht. Diese Festlegung steht in keinem Projektdokument und muss mit dem Team und dem Markt abgestimmt werden.

## 4. Fach und Reihe

Diese Angaben stehen nicht im Layout, sondern im Produkt. Sie beschreiben, wo auf dem Regal das Produkt liegt.

- **`fach`**: Nummer des Bodens (Fachs), von unten gezählt. Das unterste Fach ist **1**. Es zählt aufwärts: 2, 3, 4 …
- **`reihe`**: Position von links, wenn man vor dem Regal steht und es anschaut. Die linke Spalte ist **1**. Es zählt nach rechts: 2, 3 …
- Beide Werte sind positive ganze Zahlen. Der Konverter lehnt alles andere ab.
- Das Produkt bekommt daraus den `layoutCode` im Format `kategorie/meter/fach/reihe`. Beispiel: `520/1/2/1` ist Kategorie 520, Meter 1, Fach 2 von unten, Reihe 1 von links.

### Skizze: Regalvorderseite (Blick von vorne)

```
Regal 520/1, Blick auf die Vorderseite

              reihe 1      reihe 2      reihe 3
            +------------+------------+------------+
  fach 4    |            |            |            |   oberstes Fach
            +------------+------------+------------+
  fach 3    |            |            |            |
            +------------+------------+------------+
  fach 2    | 520/1/2/1  |            |            |   Beispiel: Produkt in Fach 2, Reihe 1
            +------------+------------+------------+
  fach 1    |            |            |            |   unterstes Fach (Bodennähe)
            +------------+------------+------------+
```

Merkregel: Die Fächer zählen von unten nach oben, die Reihen zählen von links nach rechts, jeweils aus Sicht der Person, die vor dem Regal steht.

### Skizze: Gänge von oben (Draufsicht, Eingang unten)

```
                   Markt (Draufsicht, 1 Kästchen = 1 m)

        +-------------+        Gang 1        +-------------+
        |  Regal      |   +-------------+    |  Regal      |
        |  520/1      |   |   2–3 m     |    |  510/1      |
        |  Gang 1 ·   |   |   breit     |    |  Gang 1 ·   |
        |  links ...  |   +-------------+    |  rechts ... |
        +-------------+                      +-------------+

                              ^
                           Eingang
```

Die Skizze zeigt nur das Prinzip. Die echten Maße kommen aus der Vermessung des Marktes (siehe `STORE_DATA_ENTRY.md`, Schritt 1). Gangbreiten von 2 bis 3 m stammen aus `03_PILOT_READINESS.md`, Abschnitt 4.2, und sind eine Annahme, die vor Ort gemessen werden muss.

## 5. Beispiel: ein Regal als JSON

Die Struktur stammt aus der synthetischen Fixture `scripts/pilot-data/fixtures/layout-mini.json`. Die Werte sind erfunden. Echte Marktdaten gehören nicht in dieses Dokument.

```json
{
  "shopName": "Beispielmarkt (synthetisch)",
  "gridSize": { "width": 20, "height": 20 },
  "elements": [
    {
      "id": 1001,
      "type": "entrance",
      "category": null,
      "x": 0,
      "y": 10,
      "width": 1,
      "height": 2,
      "label": "Eingang",
      "color": "#9E9E9E"
    },
    {
      "id": 1002,
      "type": "shelf",
      "category": "520/1",
      "meter": 1,
      "label": "Gang 1 · links · Milchprodukte",
      "x": 2,
      "y": 2,
      "width": 3,
      "height": 5,
      "color": "#FFE082"
    }
  ]
}
```

Erklärung der Felder:

- `gridSize`: Größe des Bereichs in Metern (1 Zelle = 1 m).
- `elements[].type`: `entrance` oder `shelf` (weitere Typen wie `wall` oder `beacon` existieren, sind hier nicht gezeigt).
- `category`, `meter`, `label`: die drei Pflichtfelder aus Abschnitt 3.
- `x`, `y`, `width`, `height`: Position und Größe in Metern. Das Regal im Beispiel ist 3 m breit und 5 m tief.
- `color`: nur Anzeige.

Der Editor speichert zusätzliche Felder (zum Beispiel `rotation`, `accessAngle`, Sperrstatus und Beacon-Angaben). Sie sind in der Spec „Layout JSON preserves editor fields“ genannt und dürfen im Export vorkommen. Sie sind für die Pilot-Konvention nicht relevant, außer die Beacon-Felder (Abschnitt 6 in `STORE_DATA_ENTRY.md`).

## 6. Zuordnung Produkt zu Regal

Der Konverter (`scripts/pilot-data/csv_to_ndjson.py`) ordnet jede Zeile der Produktliste einem Regal zu:

1. Die Kategorie der Zeile (`kategorie`) muss dem Teil vor dem `/` in `category` entsprechen.
2. `meter` der Zeile muss dem Meter des Regals entsprechen.
3. Ist `regal_label` in der Zeile gefüllt, muss es exakt dem `label` des Regals entsprechen.

Kein Treffer ergibt den Fehler `kein Regal im Layout`. Mehrere Treffer ergeben `mehrdeutig`. Dann `regal_label` ausfüllen.

Das Produkt bekommt den `layoutCode` `kategorie/meter/fach/reihe`.

## 7. Prüfung vor der Aktivierung

Vor dem Aktivieren eines Layouts gelten diese Punkte. Die Bereitschaftsseite (`GET /api/stores/{storeId}/readiness`, Seite „Pilot-Bereitschaft“) prüft die mit „automatisch“ markierten Punkte. Die Liste der Prüfungen stammt aus der Change-Beschreibung `add-store-pilot-readiness-check` (proposal.md) und ist nicht im Detail mit dem Code abgeglichen:

- [ ] `gridSize` ist in Metern und liegt zwischen 5 und 200 m. (automatisch)
- [ ] Genau ein Eingang. (automatisch)
- [ ] Jedes Ziel-Regal hat `category`, `meter` und `label` im Format aus Abschnitt 3. (automatisch, Fehlerfall: Regal ohne Pflichtfeld)
- [ ] Jedes Testprodukt hat einen `layoutCode`, der auf ein Regal im Layout zeigt. (automatisch)
- [ ] Jedes Regal hat mindestens ein Produkt, oder die Lücke ist bekannt. (automatisch geprüft; Schwere des Befunds steht im Bericht)
- [ ] Bei der Beacon-Platzierung: Beacons sind platziert und haben eine Identität (siehe `STORE_DATA_ENTRY.md`). (automatisch)
- [ ] Die Beschriftung entspricht der Festlegung aus Abschnitt 3, insbesondere `links`/`rechts`. (manuell: Mensch prüft am Grundriss)

Ein Layout mit offenen Punkten wird nicht aktiviert. Die Regel aus der Spec: Solange zwei Regale kein Label im richtigen Format haben, ist das Layout nicht aktiv.
