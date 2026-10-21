# Markt einrichten: Anleitung für Betreiber

Stand: 2026-10-21 · Gilt für das Admin unter `/admin/next/`. Die Schritte stehen in derselben Reihenfolge wie die Checkliste **„Einrichtung“** auf der Store-Seite (Admin → Stores → Markt öffnen). Die Checkliste zeigt je Schritt „Erledigt“, „Offen“, „Problem“ oder „Nicht prüfbar“ und verlinkt die Seite, auf der du den Schritt behebst. Arbeite von oben nach unten.

Weiterführend: Maße und Regelwerk in `LAYOUT_CONVENTIONS.md`, Vermessung und Konverter in `STORE_DATA_ENTRY.md`, Termin im Markt in `STORE_ONBOARDING_CHECKLIST.md`.

## Vorbereiten

- **Grundriss:** Maße von Eingang, Gängen, Regalen und Kassen in Meter (1 Zelle = 1 m). Ein Plan als PNG oder JPEG (höchstens 10 MB) lässt sich im Editor als Hintergrund einblenden und über zwei Punkte und eine echte Strecke maßstäblich anpassen.
- **Regalliste:** Pro Regal Gang, Seite (links/rechts), Warengruppe, Kategoriecode und Meterzahl, zum Beispiel `520/1`.
- **Beacon-Werte:** Pro Beacon UUID, Major und Minor. Lies sie mit der App **nRF Connect** (Scanner, Beacon antippen, Abschnitt „Apple iBeacon“). Die Projekt-UUID steht in `../hardware/BEACON_STANDARD.md`; Major ist die Standortnummer (Märkte ab 10), Minor die Nummer auf dem Etikett. UUID aus lauter Nullen ist ungültig.
- **Sortiment als CSV** (UTF-8, Trenner `;`, Kopfzeile): `id;name;kategorie;meter;fach;reihe;preis`. Pflicht sind `name`, `kategorie`, `meter`, `fach`, `reihe`; `id` und `preis` sind optional. Jedes Regal `kategorie/meter` muss im aktiven Layout existieren.

## Schritte

1. **Markt angelegt.** Admin → Stores → „Neuer Store“ (Administrator oder Regionsleitung). Für einen Testraum stellt ein Administrator das Abdeckungsprofil „Testraum“ ein (Store bearbeiten).
2. **Layout aktiv.** Im Editor das Layout zeichnen (genau ein Eingang), speichern und **veröffentlichen**. Solange kein Layout aktiv ist, sehen Kundinnen und Kunden nur das Standard-Layout. Die Checkliste meldet „Problem“, wenn die App trotz aktivem Layout das Standard-Layout liefert.
3. **Regale beschriftet.** Im Editor jedes Regal mit Kategorie, Meter und Bezeichnung `Gang <n> · <links|rechts> · <Warengruppe>` versehen. Ein Regal, das Produkte ansteuern, aber keine Bezeichnung hat, ist ein Problem.
4. **Beacons registriert und platziert.** Seite „Beacons“: Beacons mit UUID, Major und Minor anlegen und dem Markt zuordnen. Dann im Editor jedes Beacon an seiner Montageposition setzen. „Problem“ heißt: UUID/Major/Minor fehlt, ist doppelt oder passt nicht zum Layout. „Offen“ heißt: Beacon fehlt oder ist noch nicht im Layout.
5. **Sortiment importiert.** Admin → Produkte → CSV-Import (nur Administrator). Zuerst die Vorschau lesen, erst dann importieren. Die Checkliste zählt nur Produkte, die diesem Markt gehören.
6. **Suche findet Produkte des Markts.** Die Checkliste sucht nach dem ersten Produkt des Markts. „Problem“ heißt: Das Produkt ist importiert, die Suche findet es nicht. Dann Admin → Suchindex (nur Administrator), Index prüfen und neu aufbauen; Ablauf in `SEARCH_REINDEX.md`.
7. **Bereitschaftsprüfung ohne blockierende Befunde.** Seite „Pilot-Bereitschaft“. Ziel: Ampel nicht rot. Warnungen bleiben erlaubt, gehören aber in die Checkliste des Termins.

## Befunde lesen

Jeder Befund hat einen Code, einen Satz und, wo möglich, einen Link. **Blockierend** (Ampel rot) muss weg, **Warnung** (gelb) darf bleiben.

| Befund | Bedeutung | Was tun |
|---|---|---|
| `NO_ACTIVE_LAYOUT` | Kein Layout veröffentlicht | Schritt 2 |
| `ENTRANCE_COUNT` | Nicht genau ein Eingang | Eingang im Editor korrigieren |
| `PRODUCT_NO_SHELF` | Layout-Code eines Produkts trifft kein Regal | Regal anlegen oder Produkt in der CSV korrigieren |
| `TARGET_SHELF_WITHOUT_LABEL` | Regal mit Produkten ohne Bezeichnung | Schritt 3 |
| `BEACON_UUID_ALL_ZERO`, `BEACON_MAJOR_MINOR_MISSING` | UUID ungültig oder Major/Minor fehlt | Beacon-Werte in „Beacons“ eintragen |
| `BEACON_IDENTITY_DUPLICATE`, `BEACON_IDENTITY_MISMATCH` | Zwei Beacons mit gleichen Werten, oder Layout und Registrierung weichen ab | Werte mit nRF Connect nachmessen, in „Beacons“ und im Editor angleichen |
| `LAYOUT_BEACON_NOT_REGISTERED` | Beacon im Layout ist nicht registriert | In „Beacons“ anlegen und zuordnen |
| `BEACON_ASSIGNED_NOT_PLACED` (Warnung) | Beacon zugeordnet, aber nicht im Layout | Im Editor platzieren |
| `SHELF_WITHOUT_PRODUCTS` (Warnung) | Regal ohne Produkte | Prüfen, ob die CSV das Regal vergessen hat |
| `LOW_BEACON_COVERAGE` (Warnung) | Zu wenige Beacons in Reichweite | Zusätzliche Beacons einplanen |
| `COVERAGE_NOT_COMPUTED` (Warnung) | Abdeckung nicht berechnet (Gittergröße fehlt) | Gittergröße im Editor setzen |

## Wenn du nicht weiterkommst

Schicke den Markt-Code, den Namen des Schritts und den Befund-Code (oder einen Screenshot der Checkliste) an:

- **Admin, Editor, Bereitschaftsseite, Layout-Aktivierung:** Erik.
- **Katalog, CSV-Import, Suche, Suchindex, Server:** die Backend-Zuständigen im Team (Person B laut `../team/README.md`).
- **Beacons, Messung, Montage im Markt:** Feld und Hardware (Person C laut `../team/README.md`).

Passwörter, Tokens und Marktpläne gehören nicht in Chats oder Tickets.
