# Hardware-Auswahl Beacons

Status: Entwurf (Task 2.2). Vergleich und Empfehlung stehen auf Basis der Seiten, die am 2026-10-17 geprüft wurden. Die Bestellung braucht eine Freigabe (Task 2.3). Offene Felder sind mit `unbekannt (Mensch: prüfen)` markiert.

Quelle: `openspec/changes/establish-pilot-field-measurement/design.md`, Decision 3.

## Kriterien

1. iBeacon mit konfigurierbarer UUID, Major, Minor, Sendeleistung und Sendeintervall.
2. Batterie austauschbar. Batteriedatum wird in `beacons.csv` erfasst.
3. Klebemontage möglich, ohne Bohren.
4. Herstellerapp für iOS verfügbar (Pflicht). Android (Zusatz).
5. Preis je Stück und Lieferzeit.
6. Mindestens drei Modelle vergleichen. Ein Modell wird empfohlen.
7. Menge: 12 Stück (design.md, Decision 3). Der große Testraum braucht 8 Beacons (`CHECKLIST_GROSSER_RAUM.md`). Die Verteilung der übrigen Stücke ist festzulegen (Mensch).

## Vergleich

Geprüft am 2026-10-17. Nur Angaben, die auf einer Seite gesehen wurden, stehen in der Tabelle. Alles andere ist `unbekannt (Mensch: prüfen)`. Preise sind netto (ohne MwSt.), soweit auf der Seite so angegeben. Umrechnung in Euro erfolgt nicht.

Quellen (alle geprüft 2026-10-17):

- [E8, DigiKey NL (Englisch)](https://www.digikey.nl/en/products/detail/minew/E8-Standard/26724076) und [DigiKey NL (Niederländisch)](https://www.digikey.nl/nl/products/detail/minew/E8-Standard/26724076)
- [E8, BeaconZone UK](https://www.beaconzone.co.uk/e8)
- [E8, Tindie](https://www.tindie.com/products/minew/e8-asset-tracking-tag/) (nur App-Name und iOS-Kompatibilität)
- [i4, BeaconZone UK](https://www.beaconzone.co.uk/i4)
- [FSC-BP104D, Ozrobotics](https://ozrobotics.com/shop/feasycom-fsc-bp104d-waterproof-bluetooth-5-1-ibeacon-da14531-long-range-long-battery-life-ble-beacon/)
- [FSC-BP104D, Feasycom Datenblatt-Seite](https://www.feasycom.com/fi/datasheet/fsc-bp104d.pdf) (Seite mit Produktübersicht, nicht das PDF selbst)
- BC011: Nur Suchtreffer, keine Herstellerseite gefunden. Einzelpreis: [Newegg](https://www.newegg.com/p/3C6-00V6-01AY3), 3er-Pack: [Newegg Business](https://www.neweggbusiness.com/p/9B-0XP-06WS-002K8). Technische Angaben: [Desertcart-Listing](https://www.desertcart.ae/products/202371750-bc011)

| Kriterium | Minew E8 (Standard) | Minew i4 | Feasycom FSC-BP104D | Blue Charm BC011 |
| --- | --- | --- | --- | --- |
| Bezug (Shop, Land) | DigiKey NL, Marketplace, Versand von Minew (DigiKey NL). Zusätzlich BeaconZone UK, nur für Firmenkunden, EU-Bestellung braucht USt-IdNr. und EORI (BeaconZone) | BeaconZone UK, nur für Firmenkunden, EU-Bestellung braucht USt-IdNr. und EORI (BeaconZone) | Ozrobotics, Versand aus China (Ozrobotics) | Newegg (USA), kein EU-Händler gefunden |
| Preis je Stück | 8,78 € netto ab 1 Stück. 7,902 € netto in der Staffel ab 5 Stück (DigiKey NL). BeaconZone: 20,48 £ netto (nur UK) | 16,74 £ netto, 20,09 £ brutto (BeaconZone). Staffelpreise unbekannt (Mensch: prüfen) | 10,66 USD (Ozrobotics) | 45,99 USD, Einzelstück (Newegg, Suchtreffer) |
| Preis für 12 Stück | 94,82 € netto (12 × 7,902 €, Staffel 5 bis 99 laut DigiKey NL). Zuzüglich Versandpauschale 35,12 € (DigiKey NL) | unbekannt (Mensch: prüfen) | unbekannt (Mensch: prüfen). Rechnung ohne Staffelprüfung: 12 × 10,66 USD = 127,92 USD, zuzüglich 50 USD Standardversand (Ozrobotics) | unbekannt (Mensch: prüfen). 3er-Pack 103,99 USD (Newegg Business, Suchtreffer) |
| Batterie und Laufzeit (Händler- bzw. Herstellerangabe) | CR2032, eine enthalten, „1 year“ (BeaconZone). DigiKey NL: Batterie nicht angegeben | CR2477, eine enthalten, „2 years @ 1 sec advertising“ (BeaconZone) | 2 × AAA (LR03), nicht enthalten (Ozrobotics). Laufzeit nur als „Super Long Battery Life“ (Feasycom-Seite) | CR2032, „16 months“ (Händlerlisting, Suchtreffer). Hersteller nicht gefunden |
| Batterie wechselbar | ja, laut BeaconZone („the battery is replaceable“) | unbekannt (Mensch: prüfen). Rote LED zeigt schwache Batterie (BeaconZone) | unbekannt (Mensch: prüfen). Die Feasycom-Seite nennt „Replaceable Battery“ nur für FSC-BP111DX | unbekannt (Mensch: prüfen) |
| Konfigurations-App iOS | BeaconSET+, „support iOS 7.0 and above“ (Tindie). Passwortschutz vorhanden (BeaconZone) | App-Name unbekannt (Mensch: prüfen). „iOS config app: yes“ (BeaconZone) | FeasyBeacon für iOS (Feasycom-Seite) | Name unbekannt. Händler nennt „free mobile apps“ (Desertcart) |
| UUID, Major, Minor, Sendeleistung, Intervall konfigurierbar | Konfigurierbarkeit der Parameter per App laut Tindie („parameters can be configured via BeaconSET+ APP“). Welche Parameter genau: unbekannt (Mensch: prüfen). Sendeleistungsbereich −30 bis +4 dBm (BeaconZone) | unbekannt (Mensch: prüfen). Sendeleistungsbereich −30 bis +4 dBm, Modi sleep, normal, connected (BeaconZone) | unbekannt (Mensch: prüfen) | unbekannt (Mensch: prüfen) |
| Klebemontage | Aufkleber im Lieferumfang (BeaconZone). Kleben nicht bestätigt (Mensch: prüfen) | Aufkleber im Lieferumfang (BeaconZone). Kleben nicht bestätigt (Mensch: prüfen) | unbekannt (Mensch: prüfen). „circular design with ears“ (Ozrobotics) | unbekannt (Mensch: prüfen) |
| Schutzart | „not waterproof“ (BeaconZone) | unbekannt (Mensch: prüfen) | IP67, Standard. IP44 optional (Ozrobotics) | unbekannt (Mensch: prüfen) |
| Lieferzeit und Lager | ca. 10 Tage ab Minew, 33 auf Lager (DigiKey NL). Nicht stornierbar, nicht rückgabefähig (DigiKey NL). BeaconZone: 1 bis 2 Tage, 58 auf Lager | 1 bis 2 Tage, 10 auf Lager (BeaconZone) | 4 bis 7 Werktage laut Shop, Zoll zahlt Käufer (Ozrobotics) | unbekannt (Mensch: prüfen) |

Hinweise zur Tabelle:

- DigiKey nennt für die E8 „E8 Standard“. BeaconZone nennt „E8 (iBeacon, Eddystone and Accelerometer)“. Ob es dasselbe Produkt ist, ist nicht bestätigt (Mensch: prüfen, am besten über das Minew-Datenblatt und die DigiKey-Teilenummer).
- Die DigiKey-Seite nennt 35,12 € Versandpauschale. Eine Suchtrefferseite nannte 34,55 €. Maßgeblich ist der Preis auf der Bestellseite am Tag der Bestellung (Mensch: prüfen).
- Die Laufzeitangaben stammen von Händlern, nicht von Herstellerdatenblättern.

Bei keinem der vier Modelle ist auf einer geprüften Seite bestätigt, dass UUID, Major, Minor, Sendeleistung und Intervall frei einstellbar sind. Das ist das wichtigste offene Feld. Es muss vor der Bestellung im Dry-Run oder über das Datenblatt geprüft werden (Mensch).

## Empfehlung

**Empfehlung: Minew E8 (Standard), Bezug über DigiKey NL.** Diese Empfehlung beruht auf den oben verifizierten Daten. Sie ist keine Bewertung der Produkte insgesamt.

Begründung gegen die Kriterien:

1. Konfigurierbarkeit (Kriterium 1): Teilweise belegt. Die App BeaconSET+ stellt Parameter ein (Tindie). Welche genau (UUID, Major, Minor, Sendeleistung, Intervall) ist nicht bestätigt. Das ist vor der Bestellung zu prüfen (Mensch).
2. Batterie (Kriterium 2): Belegt. CR2032 ist laut BeaconZone wechselbar. Das passt zu `battery_date` in `beacons.csv`.
3. Klebemontage (Kriterium 3): Nicht bestätigt. Ein Aufkleber liegt laut BeaconZone bei (Mensch: prüfen, ob der Kleber für Regalkanten und Säulen reicht).
4. iOS-App (Kriterium 4): Belegt. BeaconSET+ unterstützt iOS 7.0 und höher (Tindie).
5. Preis und Lieferzeit (Kriterium 5): Belegt. 7,902 € netto je Stück in der Staffel ab 5 Stück. Lieferzeit ca. 10 Tage, 33 auf Lager (DigiKey NL). Der niedrigste Stückpreis in EUR, der auf einer EU-Verkaufsseite gefunden wurde.

Gründe gegen die anderen Modelle:

- Minew i4: Nur UK-Händler gefunden. Bestellung nur für Firmen, EU braucht USt-IdNr. und EORI. Nur 10 Stück auf Lager. Batterie wechselbar nicht bestätigt.
- Feasycom FSC-BP104D: Versand aus China mit 50 USD Standardversand. Käufer zahlt Zoll. Batterien nicht enthalten. Wechselbarkeit der Batterie nicht bestätigt.
- Blue Charm BC011: Nur US-Händler gefunden. Austauschbarkeit der Batterie nur aus Nutzerbewertungen, nicht bestätigt.

Risiken der Empfehlung:

- DigiKey-Bestellung ist eine Marketplace-Bestellung. Sie ist nicht stornierbar und nicht rückgabefähig. Versand kostet 35,12 €.
- Das Produkt auf DigiKey („E8 Standard“) und das bei BeaconZone („E8 iBeacon, Eddystone and Accelerometer“) sind möglicherweise nicht identisch (siehe Hinweise zur Tabelle).
- Die Laufzeit von einem Jahr stammt von einem Händler, nicht vom Hersteller.

## Bestellung

Diese Bestellung ist noch nicht ausgelöst. Sie braucht eine Freigabe (Mensch: Bestellung nach Freigabe durch Erik).

Bestellliste:

| Pos. | Menge | Artikel | Quelle | Hinweis |
| --- | --- | --- | --- | --- |
| 1 | 12 Stück | Minew E8 Standard (DigiKey-Teilenummer 6086-E8Standard-ND) | [DigiKey NL](https://www.digikey.nl/nl/products/detail/minew/E8-Standard/26724076) | Marketplace, nicht stornierbar |
| 2 | Mensch: Anzahl festlegen | Ersatzbatterie CR2032 | unbekannt (Mensch: prüfen) | Preis und Anbieter nicht geprüft |
| 3 | Mensch: Anzahl festlegen, falls nötig | Klebepads | unbekannt (Mensch: prüfen) | Nur nötig, wenn der beiliegende Aufkleber nicht ausreicht. Nicht geprüft |

Budget für die Schule (verifizierte Summe, netto):

- 12 × 7,902 € = 94,82 € (Stückpreis-Staffel ab 5 Stück, DigiKey NL)
- Versandpauschale: 35,12 € (DigiKey NL)
- Summe verifiziert: 129,94 € netto

Die Summe ist unvollständig. Es fehlen:

- Ersatzbatterien CR2032 (Preis unbekannt)
- Klebepads (Preis unbekannt, falls benötigt)
- MwSt. (in Österreich, Satz unbekannt; die DigiKey-Seite zeigt einen Bruttopreis nach niederländischem Satz)
- Zoll, falls anfallend (Mensch: prüfen)

Freigabe und Eintrag:

- Freigabe: (Mensch: Freigabe durch Erik)
- Bestellung und Lieferung: nach Bestellung in `docs/pilot-readiness/team/STATUS.md` eintragen (Task 2.3, Mensch)
