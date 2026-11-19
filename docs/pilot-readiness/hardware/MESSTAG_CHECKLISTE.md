# Messtag-Checkliste (1 Seite zum Drucken)

Raum `SPAR-Leonding-002` · Datum: ________ · Team: ______________________ · Details: `MESSTAG.md`

**Vorher**
- [ ] Beacon-Batterien neu (4 Stück), Ersatz dabei · iPhone ≥ 90 %, Powerbank
- [ ] Bluetooth an · Ortung „Beim Verwenden“ · Bewegung & Fitness erlaubt · Auto-Sperre **Nie** · Nicht stören an
- [ ] Debug-App drauf, Probeaufnahme gemacht (rotes **REC**, Vibration beim Drücken)
- [ ] Marker gedruckt (9 Seiten) · Maßband · Klebeband · Notizblatt · Stifte

**Beacons (Abschnitt 2 und 3)**
- [ ] 4 Beacons mit nRF Connect abgelesen (UUID, Major, Minor, RSSI) und in `TESTRAUM_BEACON_WERTE.md` eingetragen, gegengelesen
- [ ] Werte an Erik/Claude geschickt, Codex hat eingetragen
- [ ] `scripts/field/check_testroom_beacons.sh` grün (Exit 0)
- [ ] App zeigt alle 4 Beacons mit sich änderndem RSSI

**Raum (Abschnitt 4)**
- [ ] Wand lang (9 Zellen) ____ m · Wand kurz (5 Zellen) ____ m · Zelle = ____ m (Abweichung > 10 %: Stopp, Erik fragen)
- [ ] 8 Marker M1 bis M8 geklebt und nachgemessen (Abweichung ≤ 0,3 m)

| Marker | x / y | geklebt | geprüft |
| --- | --- | --- | --- |
| M1 | 0,5 / 7,5 | ☐ | ☐ |
| M2 | 4,5 / 7,5 | ☐ | ☐ |
| M3 | 4,5 / 5,5 | ☐ | ☐ |
| M4 | 0,5 / 5,5 | ☐ | ☐ |
| M5 | 0,5 / 3,5 | ☐ | ☐ |
| M6 | 4,5 / 3,5 | ☐ | ☐ |
| M7 | 4,5 / 1,5 | ☐ | ☐ |
| M8 | 0,5 / 1,5 | ☐ | ☐ |

**Vor jedem Lauf:** Rolle **Evaluation** · Szenario **S2** · Marker **keiner** · Messungen aufzeichnen **an** · REC sichtbar · iPhone vor dem Körper, App vorn

**Route (hin und zurück, 15 Drücke, 0,6 s drücken, Vibration, Zähler prüfen)**
`M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M7 → M6 → M5 → M4 → M3 → M2 → M1` · Tempo 0,7 bis 1 m/s · Querung nur über die Mittelgasse · nie stehen bleiben

| Lauf | Dateiname | Zähler = 15 | Beacons ok | gültig | Notiz |
| --- | --- | --- | --- | --- | --- |
| E1 | | ☐ | ☐ | ☐ | |
| E2 | | ☐ | ☐ | ☐ | |
| E3 | | ☐ | ☐ | ☐ | |
| E4 (Reserve) | | ☐ | ☐ | ☐ | |

**Ungültig, sofort neu:** App weg oder gesperrt · weniger als 15 Drücke · Beacon bewegt oder aus · Weg verlassen · Rolle nicht Evaluation · < 60 s oder > 4 min · Datei leer.

**Zeitplan:** 0:00 Aufbau · 0:10 Beacons ablesen und Marker kleben · 0:25 Kontrolle und Maßstab · 0:35 Probelauf · 0:40 E1 bis E3 · 1:10 Reserve oder Zusatzlauf · 1:20 Export und Abbau

**Danach (Mac)**
- [ ] Gültige Dateien in einen Ordner unter `swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/`
- [ ] `scripts/field/evaluate_field_day.sh <ordner>` · `BERICHT.md` gelesen (≥ 3 gültige Läufe? alle 4 Beacons?)
- [ ] `KOMMENTAR_195.md` in Story #195 gepostet · Marker abgeklebt · Batteriedatum eingetragen

**Notfall:** Etwas unklar? Aufschreiben, weitermachen, Erik fragen. Nichts löschen, nichts raten.
