# Messtag-Checkliste (zum Drucken)

Raum HTL-Testraum `SPAR-Leonding-002` · Datum Vortermin: ________ · Datum Messtag: ________ · Team: ______________________
Kontakt: Erik `<<Telefon Erik>>` · **Notfall: abbrechen, nichts löschen, Erik anrufen, neuer Termin.** Details: `MESSTAG.md`

## A. Vortermin (ca. 30 min) · Wer: Team

- [ ] Raum und Klebeband am Boden bei der Lehrkraft geklärt
- [ ] Neue Batterien in alle 4 Beacons, **Datum** auf das Beacon-Blatt (`TESTRAUM_BEACON_WERTE.md`)
- [ ] Mit nRF Connect je Beacon abgelesen: Etikett, Zelle, **UUID, Major, Minor**, TX Power, RSSI. **Genau so notieren, wie angezeigt, nichts korrigieren.** Gegenprobe (5 Schritte weg, Zahl wird schlechter) gemacht, Screenshot je Beacon
- [ ] Alle Zahlen gegengelesen
- [ ] Maßband: lange Wand (soll 9 m) ____ m · kurze Wand (soll 5 m) ____ m · Abweichung über 10 %? Nur an Erik melden
- [ ] Blatt, Screenshots und Maße an Erik übergeben

## B. Zwischen den Terminen · Wer: Erik

- [ ] Werte gegengelesen, Layout-Namen den Geräten zugeordnet (aus den Zellen)
- [ ] Codex trägt im Admin ein
- [ ] `scripts/field/check_testroom_beacons.sh` gibt Exit 0
- [ ] Batteriedatum in `beacons.csv`, Debug-App auf dem iPhone, Blätter gedruckt, Raum für den Messtag reserviert

## C. Messtag (ca. 90 min) · Wer: Team

- [ ] iPhone: Bluetooth an, Ortung „Beim Verwenden“, Bewegung & Fitness erlaubt, Auto-Sperre **Nie**, Nicht stören an, ≥ 90 %, Powerbank
- [ ] Debug-App: Beaconliste zeigt **alle 4 Beacons**, RSSI ändert sich (sonst nicht starten, Erik anrufen)
- [ ] 8 Marker geklebt (Zählung ab 0 an der Ecke von `Indooro3`, Mitte des Kreuzes) und nachgemessen, Abweichung ≤ 0,3 m
- [ ] Probelauf gemacht (nicht werten)

| Marker | Spalte, Reihe | x / y | geklebt | geprüft |
| --- | --- | --- | --- | --- |
| M1 | 0, 7 | 0,5 / 7,5 | ☐ | ☐ |
| M2 | 4, 7 | 4,5 / 7,5 | ☐ | ☐ |
| M3 | 4, 5 | 4,5 / 5,5 | ☐ | ☐ |
| M4 | 0, 5 | 0,5 / 5,5 | ☐ | ☐ |
| M5 | 0, 3 | 0,5 / 3,5 | ☐ | ☐ |
| M6 | 4, 3 | 4,5 / 3,5 | ☐ | ☐ |
| M7 | 4, 1 | 4,5 / 1,5 | ☐ | ☐ |
| M8 | 0, 1 | 0,5 / 1,5 | ☐ | ☐ |

**Vor jedem Lauf:** Rolle **Evaluation** · Szenario **S2** · Marker **keiner** · Messungen aufzeichnen **an** · REC sichtbar · iPhone vor dem Körper, App vorn · Zoom wie bei allen Läufen

**Route (15 Drücke, je 0,6 s, Vibration, Zähler prüfen), nur über die Mittelgasse queren, nie stehen bleiben:**
`M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M7 → M6 → M5 → M4 → M3 → M2 → M1`
**Zielzeit 70 bis 100 s.** E1 bis E3 Pflicht, E4 nur als Reserve, X1 optional. Nach E4 weniger als 3 gültig: **Schluss, neuer Termin.**

**Laufblatt**

| Lauf | Dateiname | Stoppuhr (s) | Zähler (soll 15) | gültig? | Auffälligkeiten (Uhrzeit) |
| --- | --- | --- | --- | --- | --- |
| E1 | | | | ☐ ja ☐ nein | |
| E2 | | | | ☐ ja ☐ nein | |
| E3 | | | | ☐ ja ☐ nein | |
| E4 (Reserve) | | | | ☐ ja ☐ nein | |
| X1 (optional) | | | | ☐ ja ☐ nein | |

**Ungültig (sofort neu, Datei nicht löschen):** App abgestürzt, im Hintergrund oder gesperrt · weniger als 15 Drücke oder falsche Stelle · Beacon bewegt oder ausgefallen · Weg verlassen oder > 3 s stehen geblieben · Rolle nicht Evaluation · Stoppuhr < 60 s oder > 4 min · Export 0 Byte.

**Zeitplan:** 0:00 Aufbau · 0:10 Beaconliste prüfen, Marker kleben · 0:30 Probelauf · 0:40 E1 bis E3 · 1:10 Reserve/X1 · 1:20 Export (AirDrop an Erik), Marker abkleben

- [ ] Nur gültige Dateien an Erik geschickt, Foto vom Laufblatt dabei
- [ ] Marker rückstandsfrei entfernt

## D. Danach · Wer: Erik

- [ ] Gültige Dateien in einen Ordner, `scripts/field/evaluate_field_day.sh <ordner>`
- [ ] `BERICHT.md` gelesen: mindestens 3 gültige Läufe? Alle 4 Beacons gehört? Ergebnis: BESSER / GLEICHWERTIG / SCHLECHTER / GEMISCHT / EXPLORATIV
- [ ] `KOMMENTAR_195.md` als Kommentar in Issue #195 gepostet
