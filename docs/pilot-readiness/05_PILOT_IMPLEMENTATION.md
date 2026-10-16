# 05 – Pilot-Umsetzung: Einrichtung eines Marktes, Hardware, Daten, Kosten, Recht

Stand: 2026-10-15 · Bezug: Pilotvariante „Hybrid“ (siehe [03_PILOT_READINESS.md](03_PILOT_READINESS.md), Abschnitt 5)

Dieses Dokument beschreibt, was konkret passiert, wenn ein Betreiber morgen sagt: „Ja, ihr könnt bei uns testen.“

Kennzeichnung: **[Belegt]** = aus Projektdaten oder Quelle, **[Annahme]** = Schätzung, vor Ort prüfen.

---

## 1. Ablauf vom „Ja“ bis zum ersten Testlauf

| # | Schritt | Wer | Aufwand Team | Aufwand Markt | Abhängigkeit |
|---|---|---|---|---|---|
| 1 | Kurze schriftliche Vereinbarung (Abschnitt 8) und Ansprechperson | Pilotkoordination | 2 h | 15 min | Schule informiert |
| 2 | Pilotbereich festlegen (3–5 Gänge, 300–600 m², stabile Warengruppen, z. B. Trockensortiment, Backzutaten, Gewürze, Konserven) | Koordination + Technik | 1 h | 15 min | – |
| 3 | Begehung und Vermessung des Bereichs | 2 Personen | 3–4 h | Zugang | Laser-Entfernungsmesser, Maßband |
| 4 | Digitalen Grundriss im Admin-Editor zeichnen (Regale, Gänge, Hindernisse, Kassen, Eingang) | Admin/Daten | 4–8 h | – | Vermessung |
| 5 | Regalabschnitte benennen (z. B. „G4-L-03“ = Gang 4, links, Abschnitt 3) und als Regal-Codes im Layout hinterlegen | Admin/Daten | 2–3 h | – | Grundriss |
| 6 | Produkte erfassen: 100–200 Testprodukte mit Name, Marke, Regal-Code | Admin/Daten | 4–8 h (Fotos der Regale, dann Tabelle, dann Import) | optional Artikelliste | Regal-Codes |
| 7 | Beacon-Plan erstellen (Abschnitt 3) und Beacons konfigurieren | Positionierung | 3–4 h | – | Grundriss |
| 8 | Beacons montieren, Positionen im Layout eintragen, veröffentlichen | Positionierung | 2–3 h vor Ort | Zugang, außerhalb Stoßzeiten | Erlaubnis |
| 9 | Kalibrier- und Messläufe mit Aufzeichnung (Abschnitt 4) | 2 Personen | 3–4 h vor Ort + 4–6 h Auswertung | Zugang | Recorder im Pilot-Build |
| 10 | Testpersonen-Läufe (Phase 2: 3–5, Phase 3: 15–30) | 2 Personen pro Termin | 2–3 h je Termin | Hinweisschild | Einwilligungen, Fragebogen |
| 11 | Datenpflege während des Piloten | Admin/Daten | 1 h pro Woche | Hinweis auf Umbauten | – |
| 12 | Demontage, Abschlussbericht, Abschlussgespräch | alle | 8–12 h | 30 min | – |

**Summe Phase 2 (technischer Test):** ca. 35–55 Personenstunden Team, ca. 1 Stunde Markt, 2–3 Termine vor Ort.
**Summe Phase 3 (Praxistest):** zusätzlich ca. 40–80 Personenstunden Team. **[Annahme, keine Erfahrungswerte]**

---

## 2. Unterlagen und Daten vom Betreiber

| Unterlage | Nötig? | Alternative, falls nicht verfügbar |
|---|---|---|
| Zustimmung zu Test und Montage (schriftlich, E-Mail reicht) | **zwingend** | keine |
| Benannte Ansprechperson | **zwingend** | keine |
| Grundriss (Bauplan, Fluchtwegplan, Ladenbauplan) | hilfreich | Selbst vermessen. Für 300–600 m² in 3–4 h machbar. Fluchtwegpläne hängen oft im Markt aus; Fotos nur mit Erlaubnis. |
| Regalplan / Planogramm | hilfreich | Regale selbst fotografieren (ohne Kunden im Bild) und Produkte daraus erfassen |
| Artikelliste mit Warengruppen | optional | Manuelle Erfassung der Testprodukte |
| Information über geplante Umbauten im Pilotzeitraum | **zwingend** | – |
| WLAN-Zugang | nicht nötig | Mobilfunk oder Offline-Daten auf dem Gerät |

**Wer darf den Grundriss zur Verfügung stellen?** Beim selbstständigen Kaufmann der Inhaber, bei Filialen nur mit Zustimmung der Zentrale **[Annahme]**. Pläne nicht veröffentlichen, nicht im öffentlichen Repository ablegen (siehe Abschnitt 8).

---

## 3. Beacons: Hardware, Anzahl, Montage

### 3.1 Ist-Stand im Projekt [Belegt]

- Geplant waren laut [README.md](../../README.md) anfänglich ca. 4 Beacons zu je ca. 20 €.
- Im Projekt ist **kein Hersteller und kein Modell dokumentiert**. Die App erwartet iBeacon-Signale bzw. Gerätenamen nach dem Muster „Indooro…“ (siehe [01_PROJECT_AUDIT.md](01_PROJECT_AUDIT.md)).
- Getestet wurde laut [documentation/fsd_fragerunde1.md](../../documentation/fsd_fragerunde1.md) nur im eigenen Testraum der Schule. Der Plan ([documentation/Layoutplan-Testraum.pdf](../../documentation/Layoutplan-Testraum.pdf)) zeigt ca. 5 m × 9 m mit 4 Beacons in den Ecken.
- Es gibt **keine aufgezeichneten Messläufe** (keine JSONL-Aufnahmen auf irgendeinem Branch).

### 3.2 Wie viele Beacons brauchen wir?

Die App rechnet die Position per Multilateration aus mindestens 3 Beacon-Distanzen. Daraus und aus allgemeinen Erfahrungswerten zu RSSI-Ortung folgt **[Annahme]**:

- Abstand zwischen Beacons ca. **6–8 m** im Raster, damit an jedem Punkt mindestens 3, besser 4 Beacons mit brauchbarem Signal sichtbar sind.
- Die Testsuite des Stabilisierungs-Branches simuliert ebenfalls ein Raster von einem Beacon je 8 m × 8 m.

| Fläche | Beispiel | Beacons |
|---|---|---|
| Testraum Schule (45 m²) | 5 × 9 m | 4 (vorhanden) |
| Pilotbereich klein | 20 × 15 m = 300 m² | 8–9 |
| Pilotbereich mittel | 25 × 24 m = 600 m² | 12–16 |
| Ganzer Markt mittelgroß | 40 × 30 m = 1.200 m² | 24–30 |

**Empfehlung für Phase 2:** 10–12 Beacons kaufen (8–9 montiert, Rest als Reserve und zum Experimentieren mit dichterem Raster).

### 3.3 Hardware-Anforderungen

- iBeacon-fähig, **UUID, Major, Minor und Sendeleistung konfigurierbar** (über Hersteller-App).
- Sendeintervall einstellbar (100–300 ms für Ortung).
- Austauschbare Batterie; Laufzeitangabe bei dem eingestellten Intervall prüfen (Münzzellen-Beacons nennen oft rund ein Jahr bei Standardeinstellungen; bei kurzen Intervallen deutlich weniger).
- Klebemontage möglich, klein, unauffällig.
- Preisrahmen: einfache Modelle ab ca. 7–9 € netto je Stück bei Distributoren, Fachhändler ca. 20–25 € je Stück (Beispiel Minew E8) **[Belegt, Händlerseiten, Preise vor Kauf prüfen]**.

**Entscheidung:** Ein Modell auswählen, Modell und Konfiguration im Repository dokumentieren (fehlt bisher).

### 3.4 Konfiguration

- Eine gemeinsame UUID für alle Indooro-Beacons, **Major = Markt**, **Minor = Beacon-Nummer**. Die Platzhalter-UUID (`0000…`) im gebündelten Layout ersetzen.
- Jeden Beacon physisch beschriften (Nummer, Minor) und im Layout mit Koordinate eintragen.
- Sendeleistung einheitlich einstellen und den gemessenen RSSI bei 1 m je Modell notieren.
- Konfigurationstabelle (Nummer, Minor, Position x/y, Höhe, Montageort, Batteriedatum) als Pilotdokument führen.

### 3.5 Montage

- **Höhe:** über Kopfhöhe, am besten auf oder an der Oberkante der Regale bzw. an Säulen, mit möglichst freier Sicht über die Gänge. Nicht hinter Ware, nicht in Metallfächern, nicht an Kühlmöbeln.
- **Befestigung:** rückstandsfrei lösbare Klebestreifen oder Kabelbinder, **kein Bohren**. Vorher Ansprechperson zeigen.
- **Genehmigung:** ausdrückliche Zustimmung des Betreibers für jeden Montageort (Foto + Plan übergeben).
- **Sicherheit:** keine Montage an Fluchtwegschildern, Brandschutzeinrichtungen, elektrischen Anlagen. Keine Leitern ohne Erlaubnis des Marktes; Montage in Reichhöhe mit Tritt, den der Markt stellt oder erlaubt.
- **Koordinaten:** Position im Grundriss auf ca. 0,5 m genau messen. Ein falsch eingetragener Beacon wirkt wie ein dauerhafter Ortungsfehler.

### 3.6 Bekannte Störeinflüsse [Annahme, allgemein aus BLE-Praxis]

- **Metallregale** schirmen ab und reflektieren. Zwischen zwei Gängen kann der Beacon im Nachbargang stärker wirken als der im eigenen Gang. Deshalb über den Regalen montieren.
- **Menschen und Einkaufswagen** dämpfen das 2,4-GHz-Signal (Wasser im Körper). Volle Gänge verschlechtern die Ortung.
- **Handyhaltung:** In der Hand vor dem Körper anders als in der Tasche oder im Wagen.
- **Gerätevarianz:** Verschiedene iPhone-Modelle messen RSSI unterschiedlich.
- Daraus folgt: Genauigkeit nur im echten Markt messen, zu verschiedenen Uhrzeiten und mit mindestens zwei iPhone-Modellen.

---

## 4. Testen und Kalibrieren der Positionierung

Voraussetzung: Pilot-Build mit dem Aufzeichnungsmodus aus `codex/stabilize-ios-navigation` (DEBUG-Recorder schreibt JSON Lines nach `Documents/NavigationRecordings/`, siehe `swift/indooro-EinkaeuferFinal/TESTING.md` auf diesem Branch) **[Belegt, Code vorhanden, im Feld nie benutzt]**.

### 4.1 Messprotokoll (pro Termin ca. 2–3 h)

1. **Bodenmarken setzen:** 8–10 Referenzpunkte im Pilotbereich mit Kreppband markieren, Koordinaten im Grundriss notieren.
2. **Stillstand:** An 4 Referenzpunkten je 60 s stehen, Aufzeichnung läuft, Marker setzen.
3. **Gehen:** Eine feste Route durch alle Gänge in normalem Tempo, an jedem Referenzpunkt Marker setzen.
4. **Falscher Gang:** Absichtlich in einen falschen Gang abbiegen und weitergehen.
5. **Zwei nahe Ziele:** An zwei fast gleich weit entfernten Produkten vorbeigehen.
6. Jede Übung mit **zwei Geräten** und zu **zwei Uhrzeiten** (leer / normal besucht) wiederholen.

### 4.2 Auswertung

- Aufnahmen ohne Gerätekennungen in `NavigationFixtures/recordings/` übernehmen (Task 12.2 der OpenSpec-Change).
- Replay mit Metriken: Positionsfehler im Stand (Median, 90-%-Wert), Nachlauf beim Gehen, Anteil der Zeit im richtigen Gang, Reroutes, Zielwechsel ohne Ereignis.
- Erst danach Parameter anpassen (Task 12.4). **Keine Parameteränderung ohne Aufnahme.**

### 4.3 Was „gut genug“ bedeutet

Siehe Akzeptanzkriterien in [03_PILOT_READINESS.md](03_PILOT_READINESS.md), Abschnitt 6.

---

## 5. Produktdaten

### 5.1 Wie viele Produkte?

- **Phase 2:** 100–200 Produkte im Pilotbereich. Reicht, um Suchaufgaben zu stellen und den Erfassungsaufwand zu messen.
- **Phase 3:** 200–500 Produkte. Für Testaufgaben werden 10–15 Zielprodukte festgelegt, die die Testpersonen nicht kennen (seltene Artikel).
- **Nicht nötig:** vollständiges Sortiment (ein Supermarkt hat 5.000–20.000 Artikel [Annahme]).

### 5.2 Wie erfassen?

1. Regale im Pilotbereich abschnittsweise fotografieren (ohne Personen).
2. Aus den Fotos eine Tabelle erstellen: Produktname, Marke, Menge, Regal-Code.
3. Tabelle über den vorhandenen Import oder die Admin-Oberfläche einspielen (Details zum Importweg in [01_PROJECT_AUDIT.md](01_PROJECT_AUDIT.md)).
4. Stichprobe: 20 zufällige Produkte in der App suchen und am Regal prüfen.

Erfassungsaufwand im Pilot messen (Minuten pro Produkt). Das ist eine der wichtigsten Kennzahlen für die Frage, ob Indooro für einen Markt dauerhaft pflegbar ist.

### 5.3 Pflege während des Piloten

- Ansprechperson meldet Umbauten (Ziel: per Nachricht an die Pilotkoordination).
- Vor jedem Testtermin 15 Minuten Stichprobe der Zielprodukte.
- Nicht verfügbare Produkte bleiben in der App mit Regal-Code; die App zeigt keinen Bestand (siehe Abschnitt 7).

---

## 6. App-Verteilung und Testgeräte

| Weg | Voraussetzung | Eignung |
|---|---|---|
| **Team-iPhones, direkt aus Xcode installiert** | Mac, kostenloses oder Schul-Apple-Konto | Phase 2: ja. Bei kostenlosem Konto laufen Builds nach 7 Tagen ab. |
| **TestFlight (interne Tester)** | Apple Developer Program (99 USD/Jahr), bis 100 interne Tester mit Rolle im Team-Konto | Für das Team. |
| **TestFlight (externe Tester)** | Developer Program, Beta-App-Review durch Apple | Phase 3 mit eigenen Geräten der Testpersonen. Review-Zeit einplanen (mehrere Tage). |
| **Leihgeräte** | 2–3 Team-iPhones mit installierter App | Phase 3: empfohlen als Hauptweg. Keine Installation bei Fremden, gleiche Geräte, weniger Datenschutzfragen. |
| App Store | Review, Datenschutzangaben, Support | **Nicht für den Pilot.** |

**Empfehlung:** Phase 2 und 3 mit **2–3 Leihgeräten** des Teams. TestFlight extern nur, wenn Phase 3 mehr Testpersonen braucht als die Leihgeräte erlauben. Klären, ob die Schule ein Apple-Developer-Konto hat.

---

## 7. Organisation des Testtermins (Phase 3)

1. Testpersonen: Freiwillige aus dem Umfeld (Familien, Lehrkräfte, Schülerinnen und Schüler) und, wenn der Markt zustimmt, Kunden, die beim Eingang angesprochen werden. Mindestalter 14; bei unter 14-Jährigen Einwilligung der Eltern **[Annahme, mit Schule klären]**.
2. Einweisung: 1 Minute, Leihgerät übergeben, Einwilligung unterschreiben.
3. Aufgabe: 3 Produkte finden (einzeln) und eine Liste mit 5 Produkten abarbeiten.
4. Vergleich: Dieselbe Person sucht 2 gleichwertige Produkte **ohne** App (Reihenfolge abwechseln).
5. Messung: Zeit pro Produkt (Stoppuhr oder App-Log), gefunden ja/nein, Hilfe nötig ja/nein, Positionskorrekturen.
6. Fragebogen: 5 Fragen, Skala 1–5, 1 Freitext (z. B. „Würden Sie die App wieder verwenden?“).
7. Gerät zurück, Aufzeichnung lokal sichern, keine Namen in den Daten.

Hinweisschild am Eingang des Pilotbereichs: „Testbetrieb eines Schulprojekts der HTL Leonding. Teilnahme freiwillig. Fragen an das Team mit Namensschild.“

---

## 8. Rechtliche und organisatorische Checkliste

Trennung: **(G)** = rechtlich klar bzw. gesetzlich vorgegeben, **(K)** = vor dem Pilot mit Schule oder Rechtsberatung zu klären, **(P)** = pragmatische Empfehlung. Dieses Dokument ist keine Rechtsberatung.

| # | Thema | Einordnung | Was zu tun ist |
|---|---|---|---|
| 1 | Zustimmung des Betreibers (Hausrecht) | (G) | Schriftliche Zustimmung für Zutritt, Test, Montage, Fotos, Hinweisschild. E-Mail oder unterschriebener One-Pager reichen als Nachweis (P). |
| 2 | Zustimmung von Zentrale/Großhändler | (K) | Im Erstgespräch fragen. Bei Filialen sehr wahrscheinlich nötig. |
| 3 | Montage der Beacons | (G/P) | Nur mit Zustimmung, rückstandsfrei, Lageplan übergeben, Eigentum bleibt beim Team bzw. der Schule. |
| 4 | Nutzung von Grundriss und Regalfotos | (K/P) | Nur für den Pilot verwenden. Nicht im öffentlichen Repository, nicht in Präsentationen ohne Erlaubnis. Repository ist auf GitHub in der Schulorganisation: prüfen, ob es öffentlich ist. |
| 5 | Produktdaten, Marken, Produktbilder | (K) | Produktnamen als Text sind unkritisch. Produktfotos von Herstellern nicht ohne Rechte verwenden. Keine Händlerlogos ohne Erlaubnis. |
| 6 | DSGVO: Standortdaten | (G) | Die Position wird auf dem Gerät berechnet. Werden Aufzeichnungen einer identifizierbaren Testperson zugeordnet, sind das personenbezogene Daten. Daher: Aufzeichnung nur mit Einwilligung, pseudonym (Test-ID statt Name), nur auf Team-Geräten, Löschung nach Auswertung, Zweck schriftlich festhalten. |
| 7 | DSGVO: Fragebogen | (G/P) | Anonym, keine Namen. Einwilligungsformular getrennt aufbewahren. |
| 8 | Einwilligungsformular für Testpersonen | (P) | Eine Seite: Zweck, welche Daten, Speicherdauer, freiwillig, jederzeit abbrechbar, Kontakt. Bei Minderjährigen Elternunterschrift (K). |
| 9 | Fotos und Videos im Markt | (G/K) | Nur mit Erlaubnis des Marktes; erkennbare Personen nur mit deren Einwilligung (Recht am eigenen Bild). |
| 10 | Backend und Upsell mit KI | (K) | Für den Pilot keine Funktionen nutzen, die Nutzereingaben an externe KI-Dienste senden. Upsell im Pilot-Build abschalten. |
| 11 | Haftung, Versicherung | (K) | Mit Schule klären: Gilt der Pilot als schulbezogene Veranstaltung (Schülerunfallversicherung)? Wer haftet für Schäden an Regalen oder Waren? Betreuungslehrkraft informieren. |
| 12 | Kennzeichnung Testsystem | (P) | Hinweisschild, Namensschilder, in der App Hinweis „Testversion“. |
| 13 | Rechte an Code und Diplomarbeit | (K) | Mit Betreuung klären, welche Rechte Schule und Team haben und ob dem Markt Nutzungsrechte eingeräumt werden dürfen. Im Pilot keine Rechte übertragen. |
| 14 | Kontaktaufnahme, Direktwerbung | (G) | § 174 TKG 2021: keine Werbeanrufe, keine Werbe-E-Mails ohne Einwilligung, auch an Unternehmen. Persönlicher Besuch, Brief, Vermittlung. Details in [06_BUSINESS_OUTREACH.md](06_BUSINESS_OUTREACH.md). |
| 15 | Vereinbarung mit dem Markt | (P) | **Eine Seite**, kein Vertragswerk: Zeitraum, Bereich, Leistungen beider Seiten, keine Kosten, jederzeitige Beendigung, Demontage, Datenumgang, Ansprechpersonen, Unterschrift Markt + Team + Betreuung. |

### Muster: Pilotvereinbarung (eine Seite)

> **Vereinbarung über einen Testbetrieb der App „Indooro“**
>
> Zwischen [Markt, Adresse, vertreten durch] und dem Diplomarbeitsteam Indooro der HTL Leonding (betreut von [Lehrkraft]).
>
> 1. Zeitraum: [von] bis [bis]. Bereich: [Gänge / Abteilungen laut Plan].
> 2. Das Team montiert bis zu [Anzahl] Bluetooth-Sender rückstandsfrei an den im Plan markierten Stellen und entfernt sie spätestens am [Datum].
> 3. Der Markt erlaubt Vermessung, Fotos von Regalen ohne Personen und Testtermine nach Absprache.
> 4. Es entstehen dem Markt keine Kosten. Es werden keine Kundendaten an den Markt oder Dritte weitergegeben.
> 5. Beide Seiten können den Test jederzeit ohne Angabe von Gründen beenden.
> 6. Veröffentlichungen mit Namen oder Bildern des Marktes nur mit vorheriger Zustimmung.
> 7. Ansprechpersonen: [Markt], [Team], [Betreuung].
>
> Ort, Datum, Unterschriften

---

## 9. Kosten eines Piloten

| Posten | Phase 2 (technischer Test) | Phase 3 (Praxistest) |
|---|---|---|
| Beacons | 10–12 Stück: ca. 100–300 € | ggf. weitere 6–8 Stück: ca. 60–200 € |
| Montagematerial, Ersatzbatterien | ca. 20–40 € | ca. 10–20 € |
| Laser-Entfernungsmesser (falls nicht in der Schule vorhanden) | ca. 30–60 € | – |
| Druck (One-Pager, Schilder, Formulare, Fragebögen) | ca. 10–20 € | ca. 20–40 € |
| Apple Developer Program | 0 € bei Schulkonto, sonst 99 USD/Jahr | – |
| Backend-Betrieb | 0 € (LeoCloud der Schule) bzw. offline | 0 € |
| Kleine Aufmerksamkeit für Testpersonen (optional) | – | ca. 50–100 € |
| **Summe Sachkosten** | **ca. 150–500 €** | **ca. 100–350 €** |
| Arbeitszeit Team | ca. 35–55 Personenstunden | ca. 40–80 Personenstunden |

Finanzierung: Projektbudget der Schule bzw. Diplomarbeitsbudget anfragen. Keine Kosten an den Markt weitergeben.

---

## 10. Größte praktische Hürden

1. **Einen Markt finden, der zusagt** – nicht technischer, sondern organisatorischer Engpass. Deshalb sofort beginnen.
2. **Ortungsqualität im echten Markt unbekannt.** Gegenmaßnahme: Hybridvariante, bei der die App auch ohne Ortung nützlich ist.
3. **Datenerfassung kostet Zeit** und skaliert nicht. Gegenmaßnahme: kleiner Pilotbereich, Aufwand messen, Ergebnis ehrlich berichten.
4. **Zentralgesteuerte Händler** entscheiden langsam. Gegenmaßnahme: selbstständige Kaufleute priorisieren.
5. **Code-Stand verteilt auf unverbundene Branches** (siehe [02_BRANCH_ANALYSIS.md](02_BRANCH_ANALYSIS.md)). Gegenmaßnahme: ein Pilot-Branch, Feature-Stopp.
