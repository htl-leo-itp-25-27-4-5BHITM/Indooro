# Pilot-Daten: Produktliste in Importdaten umwandeln

`csv_to_ndjson.py` liest die Produktliste eines Marktes (CSV, Vorlage:
`docs/pilot-readiness/kit/produkte-vorlage.csv`), prüft jede Zeile gegen das
Layout-JSON des Marktes und schreibt die Produkte als Importdatei.

Das Skript braucht nur die Python-Standardbibliothek (Python 3.10 oder neuer)
und keine Installation.

## Was das Skript prüft

Alle Fehler werden gemeldet, nicht nur der erste. Jede Fehlerzeile beginnt mit
der Zeilennummer der CSV-Datei (Kopfzeile = Zeile 1):

- kein passendes Regal im Layout (siehe Zuordnungsregel unten)
- mehrere passende Regale ohne `regal_label`
- doppelte `id`
- leerer `name`
- `fach` oder `reihe` nicht als positive ganze Zahl
- `meter` nicht als positive ganze Zahl
- `preis` ungültig (`2,99` und `2.99` sind beide gültig; höchstens zwei Nachkommastellen)
- fehlende oder unbekannte Spalten (einmal als Kopfzeilenfehler gemeldet)
- Datei nicht UTF-8-kodiert

Bei mindestens einem Fehler wird **keine Datei geschrieben** und das Skript
endet mit Code `1`. Eine bereits vorhandene Ausgabedatei bleibt unverändert.

Das Layout wird nur minimal geprüft: Ein fehlender oder doppelter Eingang
(`type: entrance`) erzeugt eine Warnung, kein Fehler.

## Zuordnungsregel: Zeile zu Regal

In der Layout-JSON hat jedes Regal (`type: "shelf"`) eine `category` im Format
`<Kategorie>/<Meter>`, zum Beispiel `520/1`, sowie ein `meter`-Feld und eine
`label`-Bezeichnung wie `Gang 1 · links · Milchprodukte`.

Eine CSV-Zeile passt auf ein Regal, wenn gilt:

1. Der Teil vor dem ersten `/` der `category` ist gleich `kategorie` der Zeile.
2. `meter` des Regals (oder, falls dieses Feld fehlt, der Teil nach dem `/`
   der `category`) ist gleich `meter` der Zeile.
3. Ist `regal_label` der Zeile nicht leer, ist die `label` des Regals gleich
   `regal_label`. Der Vergleich ist exakt, nach dem Zusammenfassen mehrfacher
   Leerzeichen; Groß- und Kleinschreibung zählt.

Ergibt sich kein Treffer, lautet der Fehler `kein Regal im Layout`. Ergeben sich
mehrere Treffer, lautet er `mehrdeutig`; dann `regal_label` ausfüllen.

Die `layoutCode` jedes Produkts ist `kategorie/meter/fach/reihe`, zum Beispiel
`520/1/2/1`. Die Vorlage ist so gebaut, dass sie direkt zu dieser Regel passt.

## Aufruf

Die Befehle stehen im Repository-Stammverzeichnis.

**Windows (PowerShell):**

```powershell
py -3 -I scripts\pilot-data\csv_to_ndjson.py produkte.csv markt-layout.json --store-id MARKT-01 --store-code SPAR-LEONDING-001 --out produkte.ndjson
```

**macOS:**

```bash
python3 -I scripts/pilot-data/csv_to_ndjson.py produkte.csv markt-layout.json --store-id MARKT-01 --store-code SPAR-LEONDING-001 --out produkte.ndjson
```

Optionen:

- `--store-id` und `--store-code` (Pflicht): werden in jedes Produkt geschrieben
- `--out` (Pflicht): Ausgabedatei
- `--id-start` (Standard `1`): Startwert für automatisch vergebene IDs. Leere
  `id`-Zellen bekommen fortlaufende Nummern, die keine explizite ID verwenden.
- `--format ndjson` (Standard): ein Produktobjekt pro Zeile, ohne Aktionszeilen.
  Empfohlen für den Admin-Katalogimport.
- `--format array`: ein JSON-Array. Empfohlen für `POST /api/products/bulk`.
- `--format bulk-pairs`: Aktion und Dokument als Paare, wie
  `backend/indooro_server/demoproducts.ndjson`. Veraltet, nur für OpenSearch `_bulk`.

Das Skript liest CSV mit Trennzeichen `;` oder `,` und mit oder ohne BOM
(Excel auf Windows). Was erkannt wurde, meldet es auf stderr.

Excel: Datei speichern unter **CSV UTF-8 (Trennzeichen-getrennt)**. Das ist das
Format, das Umlaute und Semikolons korrekt erhält.

## Rückgabecodes

| Code | Bedeutung |
|------|-----------|
| 0 | erfolgreich, Datei geschrieben |
| 1 | Fehler in der CSV, keine Datei geschrieben |
| 2 | Eingabe oder Layout nicht lesbar, Ausgabe nicht schreibbar |

Bei Erfolg zeigt das Skript eine Zusammenfassung: Zeilen, verwendete Regale,
Regale ohne Produkte (mit Bezeichnung) und Anzahl automatisch vergebener IDs.
Regale ohne Produkte sind keine Fehler, aber vor dem Pilot prüfen: Fehlt dort
ein Sortiment, hat der Kunde später nichts zu finden.

## Import

Beide Wege setzen eine **Admin-Anmeldung** voraus.

**1. Admin-Katalogimport (empfohlen: `--format ndjson`).** Im Admin-Bereich den
Produktimport öffnen und die Datei einfügen oder hochladen. Der Import akzeptiert
ein JSON-Array oder NDJSON mit einem Produktobjekt pro Zeile. Die Paare aus
`--format bulk-pairs` werden dort abgelehnt.

**2. API (`--format array`).** `POST /api/products/bulk` erwartet ein JSON-Array.
Die Anmeldung erfolgt über OIDC (Keycloak). Der Bearer-Token ist hier nur ein
Platzhalter. Den echten Token nicht in Dateien oder Chats speichern:

```bash
curl -X POST http://localhost:8080/api/products/bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  --data-binary @produkte.json
```

`<ADMIN_TOKEN>` durch den Token eines Admin-Benutzers ersetzen. Zugangsdaten
gehören nicht in dieses Repository.

## Zurücksetzen (Rollback)

Das Skript schreibt keine eigene Rollback-Datei. Die IDs stehen im Feld `id`
jedes Produkts der Ausgabedatei (bei `ndjson` und `array`). Die Liste der IDs
erhält man mit:

```bash
python3 -I -c "import json; print(','.join(str(json.loads(l)['id']) for l in open('produkte.ndjson', encoding='utf-8') if l.startswith('{\"id\"')))"
```

**Caveat, nicht verifiziert:** Ob der Admin-Bereich oder die API einen Löschvorgang
nach ID anbietet, ist nicht geprüft. Der Weg über OpenSearch, zum Beispiel
`_delete_by_query` mit einer `terms`-Abfrage auf das Feld `id`, wurde gegen keine
laufende Instanz getestet. Vor dem Pilot an einer Testinstanz prüfen. Vor dem
Löschen sicherstellen, dass nur Produkte des Pilot-Marktes betroffen sind
(`storeId`).

## Tests

Die Tests laufen ohne echte Marktdaten. Alle Fixtures sind synthetisch
(`fixtures/`). Ausführung im Repository-Stammverzeichnis:

```powershell
py -3 -I -m unittest discover scripts\pilot-data
```

```bash
python3 -I -m unittest discover scripts/pilot-data
```
