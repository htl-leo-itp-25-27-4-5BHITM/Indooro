# 03 – Pilot-Readiness: Produktreife, Positionierung, Pilot-MVP, Reality Check

Stand: 2026-10-15 · Grundlage: [01_PROJECT_AUDIT.md](01_PROJECT_AUDIT.md), [02_BRANCH_ANALYSIS.md](02_BRANCH_ANALYSIS.md), [docs/NAVIGATION_REVIEW.md](../NAVIGATION_REVIEW.md)

---

## 1. Kurzurteil

| Frage | Antwort |
|---|---|
| Ist Indooro technisch weit genug, um einen Betreiber **anzusprechen**? | **Ja**, wenn wir ehrlich einen Test anbieten und eine stabile Demo ohne Live-Ortung zeigen. |
| Ist Indooro weit genug für einen **Test im Markt**? | **Noch nicht.** Es fehlen ein integrierter Pilot-Build, lesbare Regalangaben, Offline-Robustheit, eine erreichbare manuelle Positionskorrektur und vor allem jede Messung mit echten Beacons außerhalb des Klassenraums. Aufwand bis dahin: ca. 2–3 Wochen fokussierte Arbeit. |
| Ist BLE-Navigation „zum Regal“ realistisch? | **Unbewiesen und vermutlich zu ungenau für Regalebene.** Realistisch ist „ungefähr welcher Bereich / welcher Gang“. Der Pilot muss so gebaut sein, dass er auch ohne genaue Ortung nützt. |
| Produkt oder Prototyp? | **Technisch interessanter Prototyp** mit einem nützlichen Kern (Produktfinder mit Karte), der im Feld noch nie validiert wurde. |

---

## 2. Kritische Blocker, Risiken, kleinere Probleme

### 2.1 Kritische Blocker (vor dem ersten Test im Markt zu lösen)

| # | Blocker | Beleg | Lösung | Aufwand |
|---|---|---|---|---|
| K1 | **Keine Felddaten zur Ortung.** Kein einziger aufgezeichneter Lauf mit echten Beacons, auch nicht im Testraum. | 01, Abschnitt 4/5; OpenSpec-Tasks 12.1–12.5, 13.6 offen | Recorder-Build auf Team-iPhone, Messlauf im Testraum der Schule und in einem größeren Raum (Gang, Bibliothek, Turnsaal mit Regalen o. Ä.), danach im Markt | 3–5 Tage |
| K2 | **Code-Stand auf zwei ungemergten, teils ungepushten Branches** mit 3 Konfliktdateien. | 02, Abschnitt 3 | Pushen, Integrationsbranch `pilot/first-store`, Feature-Freeze | 1–2 Tage |
| K3 | **Regalangabe für Kunden unlesbar** („Gang 310, Regal 1“ = Kategoriecode/Meter). | `StoreMapPage.swift:852-862` | Regal-Label im Layout (z. B. „Gang 4 · links · Backzutaten“) und Fach als „2. Boden von unten“ anzeigen | 1–2 Tage |
| K4 | **Offline-Fallback zeigt den Testraum**, kein Layout-Cache; Suche nur online. | `BeaconManager.swift:1345-1407` | Pilotmarkt-Layout und -Produkte nach erstem Laden auf dem Gerät speichern; Fallback = letzter Stand des Pilotmarkts | 1–2 Tage |
| K5 | **Ohne Position keine Route, manuelle Position nicht sauber erreichbar.** Ohne bekannte Position setzt die Session nur `needsRoute = true` und zeichnet nichts; „Ich stehe hier“ steckt in totem Code, Tippen wirkt nur in bestimmtem Modus. | `NavigationSessionCore.swift:358-366`; `HeaderView.swift` nie instanziiert; `MapView.swift:140-146` | Rückfall-Startpunkt: Eingang bei Tourstart, danach Regal des zuletzt erledigten Stopps; sichtbarer Knopf „Ich bin hier“ | 1 Tag |
| K6 | **App nicht verteilungsfähig geprüft:** fehlender Asset-Katalog (App-Icon), iOS 18.5 als Mindestversion, nie mit `xcodebuild` für Gerät in dieser Analyse geprüft. | 01, Abschnitt 3.1 | Asset-Katalog ergänzen, Mindestversion an Testgeräte anpassen, auf 2–3 iPhones installieren | 0,5–1 Tag |
| K7 | **Produktsuche bricht bei `&`, `+`, `=`**, Fehler werden verschluckt. | `ProductSearchStore.swift:27, 44-49` | `URLComponents`/`URLQueryItem` verwenden, Fehlermeldung anzeigen | 0,5 Tag |
| K8 | **Backend offen:** OpenSearch ohne Sicherheit per `NodePort`, Klartext-Passwörter im Repo, kein Backup. | 01, Abschnitt 3.3 | OpenSearch auf `ClusterIP`, Passwörter rotieren, `pg_dump` vor jedem Pilottermin. Oder: Pilot-App arbeitet mit lokalem Datensnapshot (siehe 4.3) | 1–2 Tage |
| K9 | **Kein Pilotpartner.** | – | Sofort beginnen (siehe [04](04_FIRST_SUPERMARKET_STRATEGY.md)) | laufend |

### 2.2 Mittlere Risiken

- **M1 Parameter „provisional“:** 13 Schwellwerte (Off-Route 4 m / 2,5 s, Sprung-Gate, Filter-Alphas) sind geschätzt. Off-Route 4 m liegt *unter* dem synthetischen 95-%-Fehler von ca. 5 m → im Markt drohen Fehl-Reroutes. Erst messen, dann einstellen.
- **M2 Ungeklärte 17-m-Sprünge** in zwei Replay-Szenarien (01, Abschnitt 5).
- **M3 Datenpflege:** Jede Produktposition hängt an einem manuell gepflegten Code. Ohne Import aus Händlersystemen skaliert das nicht. Im Pilot messen.
- **M4 Rasterbezug:** Einheit „1 Zelle = 1 m“ nirgends festgelegt, Beacon-Koordinaten müssen auf ca. 0,5 m stimmen.
- **M5 Wissenskonzentration:** 370 von 480 Commits über ein Konto, überwiegend KI-gestützt. Wenn nur eine Person den Navigationscode versteht, ist der Pilot an diese Person gebunden.
- **M6 Automatische Markterkennung** lädt ohne Rückfrage und überschreibt die Wahl.
- **M7 Herkunft realer Daten:** SPAR-Layout und Belegplan-Scan im Repository ohne dokumentierte Erlaubnis.
- **M8 LeoCloud-Verfügbarkeit** (Schulinfrastruktur, 1 Replica, keine Überwachung).

### 2.3 Kleinere Probleme

- Englische Begriffe in der deutschen Oberfläche, Debug-Modus für Kunden sichtbar.
- Berechtigungsabfragen beim Start ohne Erklärung; Bluetooth aus wird nicht angezeigt.
- Kein Timeout für Netzwerkanfragen (60 s Standard).
- README, Präsentationsdateien und 7 Layout-JSONs werden ins App-Bundle kopiert.
- Toter Code (`HeaderView`, `SearchOverlayView`, `MapHeaderView`, `LayoutSelectionSheet`, `Pathfinder`).
- ATS global deaktiviert.

### 2.4 Langfristige Herausforderungen (nicht für den ersten Pilot)

- Automatische Übernahme von Sortiments- und Planogrammdaten aus Händlersystemen.
- Wartung der Beacons (Batterien, Diebstahl, Umbauten).
- Android (Planung vorhanden, kein Code).
- Geschäftsmodell (wer zahlt wofür?).
- Datenschutzkonzept für Kundenbetrieb ohne Begleitung.

---

## 3. Pilot-MVP

### 3.1 Einordnung aller Funktionen

**A – Zwingend erforderlich**

| Funktion | Stand | Was noch fehlt |
|---|---|---|
| Pilotmarkt auswählen bzw. fest eingestellt | vorhanden | Auto-Erkennung im Pilot-Build abschalten |
| Grundriss des Pilotbereichs mit lesbaren Regal-Labels | Editor vorhanden | Labels, Vermessung des echten Marktes |
| Produktsuche (100–500 Produkte) | vorhanden, Bug | Encoding-Fix, Fehlermeldung, „nicht gefunden“-Zustand |
| Ergebnis: Regal markiert + Text „Gang X · Seite · Abschnitt · Boden“ | teilweise | K3 |
| Einkaufsliste, nach Laufweg sortiert, „Erledigt“/„Überspringen“ | vorhanden (Stabilisierung) | Pilot-Branch |
| Route vom Eingang bzw. von „Ich bin hier“ zum aktiven Ziel | vorhanden | K5 |
| Stabile Ziele ohne Flattern | vorhanden (Stabilisierung, getestet) | Pilot-Branch |
| Modus „Ohne Ortung“ für Kunden verständlich | vorhanden als Debug | umbenennen, sichtbar |
| Offline-robuste Daten des Pilotmarkts | fehlt | K4 |
| Aufzeichnung der Messläufe auf Team-Geräten | vorhanden (DEBUG) | interner Build |
| Installation auf 2–3 iPhones | ungeprüft | K6 |
| Datenerfassung für 100–200 Produkte | vorhanden (JSON/NDJSON-Import) | kleines CSV→NDJSON-Skript oder Tabelle |

**B – Wichtig, aber vereinfachbar**

| Funktion | Vereinfachung im Pilot |
|---|---|
| BLE-Position als blauer Punkt | Als „ungefährer Standort“ (Kreis statt Punkt) anzeigen; abschaltbar |
| Rerouting | Konservativ einstellen (größere Schwelle, längere Haltezeit) oder im Pilot nur „Neu planen“-Knopf |
| Tour-Optimierung NN + 2-opt | vorhanden, unverändert lassen |
| Onboarding | Ein einziger Erklärbildschirm + Berechtigungen erst beim Einschalten der Ortung |
| Admin | Den Admin verwenden, der funktioniert (`main` live oder Rebuild lokal). Kein Neubau |
| Backend-Sicherheit | Nur K8: OpenSearch schließen, Passwörter rotieren, Backup |
| Fehlermeldungen | Für Suche, Netzwerk, Bluetooth, Standort |
| Sprache | Alle sichtbaren Texte Deutsch |

**C – Optional**

Automatische Markterkennung, Rezepte, Listen teilen, Preise, Kartenrotation/Kompass, Barrierefreiheit über Grundniveau hinaus, Mehrfachlisten.

**D – Später (Skalierung, kommerzieller Betrieb)**

| Funktion | Für ersten Pilot nötig? | Begründung |
|---|---|---|
| Vollständige Sortimentsintegration | **Nein** | 100–500 Produkte reichen für Suchaufgaben |
| Automatische Warenbestandsdaten | **Nein** | Kein Zugriff auf Warenwirtschaft; Bestand ist nicht die Testfrage |
| Mehrere Märkte | **Nein** | Ein Markt |
| Komplexe Benutzerverwaltung / Rollen | **Nein** | Admin bedient das Team |
| Personalisierte Accounts | **Nein** | Widerspricht Datensparsamkeit |
| Loyalty | **Nein** | Kein Bezug zur Testfrage |
| Produktbilder | **Nein** | Rechtefragen, Aufwand; Name + Marke reichen |
| Erweiterte Analytics | **Nein** | Messung über Recorder und Protokoll |
| App-Store-Veröffentlichung | **Nein** | Leihgeräte bzw. TestFlight |
| Zahlungsfunktionen | **Nein** | – |
| Produktionsreife Cloud | **Nein** | LeoCloud + Backup bzw. lokaler Snapshot |
| KI-Upsell | **Nein** | Im Pilot-Build abschalten |
| AR-Navigation | **Nein** | Experiment, nach dem Pilot neu bewerten |
| Android | **Nein** | – |

### 3.2 Pilot-MVP – exakte Definition

**Das Pilot-MVP kann:**

1. Auf 2–3 Team-iPhones installiert werden und startet direkt im Pilotmarkt.
2. 100–500 Produkte des Pilotbereichs suchen (auch mit Sonderzeichen) und klar sagen, wenn etwas nicht gefunden wird.
3. Für jedes Produkt den Regalabschnitt auf der Karte markieren und in Worten beschreiben, wie es im Markt beschildert ist.
4. Eine Einkaufsliste in Laufreihenfolge vom Eingang aus anzeigen; Ziele wechseln nur durch „Erledigt“, „Überspringen“, Listenänderung oder „Neu planen“.
5. Eine Route vom Eingang oder vom Punkt „Ich bin hier“ zum aktiven Ziel zeichnen.
6. Optional eine ungefähre BLE-Position anzeigen, die der Nutzer per Tippen korrigieren kann.
7. Ohne Netzwerk mit dem zuletzt geladenen Stand des Pilotmarkts weiterarbeiten.
8. Auf Team-Geräten jeden Lauf aufzeichnen (Rohmessungen, Ereignisse, Korrekturen).

**Das Pilot-MVP enthält ausdrücklich nicht:** Rezepte (ausgeblendet oder unverändert, nicht gezeigt), KI-Upsell, AR, automatische Markterkennung, mehrere Märkte, Konten, Produktbilder, Bestände, Preise als Verkaufsargument, Android, App Store, neue Admin-Funktionen, neue Positionsfilter.

### 3.3 Minimale Produktqualität aus Betreibersicht

Ein Betreiber kann einen begrenzten Pilot verantworten, wenn:

- Die App in allen Testläufen **nicht abstürzt** und nie hängen bleibt.
- **Jedes** Testprodukt auf das richtige Regal zeigt (Datenqualität vor Ortungsqualität).
- Die App bei schlechter Ortung **nicht in die Irre führt**: lieber „Standort ungenau – Regal ist hier markiert“ als ein springender Punkt.
- Testpersonen jederzeit zur einfachen Liste mit Regalangaben wechseln können.
- Das Personal maximal 2 Stunden über den gesamten Pilot gebunden ist.
- Keine Kundendaten den Markt verlassen.

---

## 4. Positionierung in der Praxis

### 4.1 Was wir heute belegen können

| Aussage | Belegt? |
|---|---|
| Die App empfängt iBeacon-Signale und berechnet daraus eine Position | Ja, im Testraum (Projektdoku), nicht aufgezeichnet |
| Die Navigationslogik bleibt bei verrauschten Eingaben stabil (keine Zielwechsel, deterministische Routen, ein Reroute bei echter Abweichung) | Ja, **synthetisch** (77 Tests) |
| Positionsfehler bei 8 × 8 m Beacon-Raster: Mittel ca. 3 m, 95 % ca. 5 m | **Nur Simulation** mit angenommenem Rauschen |
| Genauigkeit im Supermarkt | **Nein** |
| Verhalten bei Metallregalen, Kunden, Einkaufswagen | **Nein** |
| Anzahl benötigter Beacons | **Nein** (Schätzung: ein Beacon je 6–8 m, siehe [05](05_PILOT_IMPLEMENTATION.md)) |
| Ziel „ca. 1 m“ (FSD NFR-01) | **Nein**, und für RSSI-BLE im Supermarkt sehr unwahrscheinlich |
| Ziel „4–5 m“ | **Nein**, aber plausibel erreichbar bei dichtem Raster |

### 4.2 Reichen 4–5 m?

Supermarktgänge sind typischerweise 2–3 m breit, Regalreihen ca. 1–2 m tief; der Abstand von Gangmitte zu Gangmitte liegt damit bei ca. 3–5 m **[Annahme, vor Ort messen]**. Daraus folgt:

- Bei 4–5 m Fehler kann die App **nicht sicher sagen, in welchem Gang** jemand steht. Sie kann sagen, in welchem **Bereich** (vorne/hinten, linke/rechte Hälfte).
- „Bieg jetzt in diesen Gang ab“ ist mit 4–5 m nicht verlässlich. Off-Route-Erkennung mit 4 m Schwelle löst dann Fehlalarme aus.
- Für die eigentliche Kundenfrage „Wo steht das Produkt?“ ist die Ortung **nicht nötig**: Das markierte Regal plus Gangangabe beantwortet sie. Die Ortung hilft nur bei der Orientierung „Wo bin ich im Vergleich dazu?“.

**Konsequenz:** Positionierung ist im Pilot ein *Messobjekt* und eine *Komfortfunktion*, nicht die Grundlage der Führung.

### 4.3 Pilotvarianten

| | **A – Vollständiger BLE-Pilot** | **B – Reduzierter Pilot (ohne Ortung)** | **C – Hybrid-Pilot** |
|---|---|---|---|
| Funktionsweise | Live-Position, Route folgt Nutzer, Reroutes | Start am Eingang, Route und Liste in Laufreihenfolge, Nutzer hakt ab | Start am Eingang, ungefähre BLE-Position als Kreis, Tippen „Ich bin hier“ korrigiert, Rerouting konservativ |
| Hardware | 15–30 Beacons (ganzer Markt) | keine | 8–12 Beacons (Pilotbereich) |
| Abhängigkeit von Ortungsqualität | vollständig | keine | teilweise, mit Rückfallebene |
| Entwicklungsaufwand bis Pilot | hoch (Kalibrierung, viele Feldtage) | niedrig (K2–K7) | mittel (K1–K7) |
| Risiko, dass Pilot scheitert | **hoch** | niedrig | mittel-niedrig |
| Aussagekraft für die Diplomarbeit | hoch, *wenn* es funktioniert | mittel (Produktfinder, nicht Navigation) | **hoch**: Nutzen messbar *und* Ortung gemessen |
| Aufwand für den Markt | Montage im ganzen Markt | fast keiner | Montage in einem Bereich |

**Empfehlung: Variante C**, mit **B als jederzeit schaltbarer Rückfallebene** (gleicher Build, Ortung aus). Variante A erst, wenn die Messungen aus Phase 2 zeigen, dass der Gang zuverlässig erkannt wird.

Die Phase-2-Messungen entscheiden über den Modus in Phase 3:

| Messergebnis Phase 2 (Pilotbereich, Median / 90 % Positionsfehler, Gang korrekt) | Modus Phase 3 |
|---|---|
| ≤ 2,5 m / ≤ 4 m, Gang korrekt ≥ 80 % | C mit Rerouting, Ausblick auf A |
| ≤ 4 m / ≤ 6 m, Gang korrekt ≥ 60 % | C ohne automatisches Rerouting |
| schlechter | B (Ortung aus), Messdaten als Ergebnis der Diplomarbeit |

### 4.4 Kann die App ohne exakte Positionierung sinnvoll navigieren?

Ja, wenn wir „Navigation“ als **geführten Einkauf** verstehen: feste Startposition (Eingang), Reihenfolge nach Laufweg, markiertes Ziel, Route vom zuletzt erledigten Ziel zum nächsten. Nach „Erledigt“ ist die Position des Kunden bekannt (er steht am Regal des erledigten Produkts). Das ist ein robustes Ortungssignal ohne Beacons und wird heute nicht genutzt. **Diese Idee ist die günstigste Verbesserung der Navigation überhaupt** (Aufwand ca. 0,5 Tage: Startpunkt der nächsten Route = Regal des erledigten Stopps, wenn keine bessere Position vorliegt).

---

## 5. UX aus Kundensicht

| Frage | Heute | Für den Pilot |
|---|---|---|
| Versteht ein normaler Kunde die App ohne Erklärung? | Nein: 5 Tabs (Start, Planung, Rezepte, Einkaufen, Karte), Berechtigungsabfragen beim Start, englische Begriffe | Kurze Einweisung durch das Team (1 Minute) ist im begleiteten Test akzeptabel; Rezepte-Tab ausblenden |
| Wie startet die Navigation? | Liste anlegen → Einkaufen → Karte, oder Produkt suchen → „Route starten“ | Ein klarer Einstieg „Produkt suchen“ und „Meine Liste“ |
| Was, wenn die Position falsch ist? | Tippen auf die Karte nur in bestimmtem Modus | „Ich bin hier“-Knopf (K5) |
| Was, wenn ein Produkt nicht gefunden wird? | Suche: leere Liste ohne Erklärung; Karte: Ziel wird still gelöscht | Meldung „Nicht im Testbereich – bitte Personal fragen“ |
| Was, wenn ein Produkt nicht verfügbar ist? | App kennt keinen Bestand | Regal wird trotzdem gezeigt; „Überspringen“ |
| Was, wenn die App abstürzt oder die Ortung ausfällt? | Ortung aus → keine Position, Hinweis „Signal schwach“ | Ortung aus ist kein Fehler: Modus B funktioniert weiter; Testperson hat ausgedruckte Liste mit Regalangaben als Rückfall |
| Zurück zur einfachen Liste? | Ja, Tab „Einkaufen“ | Liste muss Regalangaben in Worten zeigen |

---

## 6. Messbare Erfolgskriterien

Alle Zielwerte sind **vorläufige Akzeptanzkriterien**, abgeleitet aus Gangbreiten und Pilotumfang, nicht aus Erfahrungswerten. Nach dem ersten Messtermin überprüfen.

### 6.1 Gate vor dem ersten Termin im Markt (Testraum/Schule)

| Kriterium | Ziel |
|---|---|
| Pilot-Build läuft auf 2 iPhone-Modellen | ja |
| 10 Testläufe ohne Absturz | 10/10 |
| Aufzeichnung + Replay eines echten Laufs funktioniert | ja |
| Positionsfehler im Testraum gemessen (Median, 90 %) | Werte liegen vor (kein Zielwert) |
| 20 Suchbegriffe inkl. Sonderzeichen | 20/20 korrekt |

### 6.2 Phase 2 – technischer Test im Markt

| Kennzahl | Vorläufiges Kriterium | Messweg |
|---|---|---|
| Datenqualität: Produkt zeigt aufs richtige Regal | 100 % von 20 Stichproben | Stichprobe am Regal |
| Abstürze | 0 | Beobachtung |
| Positionsfehler im Stand (Median / 90 %) | Entscheidungsgröße für Modus (Tabelle 4.3) | Recorder + Bodenmarken |
| Gang korrekt erkannt beim Gehen | Entscheidungsgröße | Recorder + Ground-Truth-Marker |
| Zielwechsel ohne Ereignis | 0 | Replay-Metrik `stopChanges` |
| Reroutes, während man auf der Route bleibt | ≤ 1 pro Tour | Replay-Metrik |
| Falscher Gang → genau 1 Reroute | innerhalb ≤ 10 s | Replay-Metrik `offRouteDelays` |
| Erfassungsaufwand | gemessen (Minuten/Produkt, Stunden/Layout) | Zeiterfassung |
| Akkuverbrauch in 30 min Navigation | gemessen | iOS-Batterieanzeige |

### 6.3 Phase 3 – Praxistest mit Testpersonen

| Kennzahl | Vorläufiges Kriterium |
|---|---|
| Anteil erfolgreich abgeschlossener Suchaufgaben ohne Hilfe des Personals | ≥ 90 % |
| Suchzeit für seltene Produkte mit App vs. ohne App (gepaarter Vergleich) | mit App bei ≥ 60 % der Aufgaben schneller |
| Manuelle Positionskorrekturen pro Tour (Variante C) | Median ≤ 2 |
| Unbegründete Zielwechsel | 0 |
| Falsche Routenänderungen (Reroute ohne Abweichung) | ≤ 1 pro Tour |
| Navigationsabbrüche (Testperson gibt App auf) | ≤ 10 % |
| „Würde die App wieder nutzen“ (Skala 1–5, Wert ≥ 4) | ≥ 60 % der Testpersonen |
| Aufwand Marktpersonal | ≤ 2 h gesamt |
| Technische Fehlerquote (Absturz, Hänger, falsche Daten) | ≤ 1 Vorfall pro 20 Touren |

---

## 7. Reality Check

**Ist Indooro weit genug, um einen Pilotpartner anzusprechen?**
Ja – *ansprechen*. Eine Demo von Suche, Regalmarkierung, Liste und stabiler Route ist heute möglich. Nicht weit genug ist es, um einem Betreiber eine funktionierende Navigation zu *versprechen*.

**Ist unsere Positionierung technisch realistisch?**
Für „ungefährer Bereich“: wahrscheinlich ja. Für „richtiger Gang“: offen. Für „richtiges Regal“ (1 m, FSD NFR-01): nein, nicht mit RSSI-BLE und vertretbarer Beacon-Dichte. Das Projektziel aus dem Projektauftrag („nur Startpunkt + Zielroute“, README Nicht-Ziele) war realistischer als das, was später gebaut wurde.

**Ist die Lösung einfacher als die normale Produktsuche?**
Für Stammkunden und häufige Produkte: nein. Für seltene Produkte, fremde Märkte und große Flächen: möglicherweise. Das ist genau die Hypothese, die Phase 3 prüfen muss. Der stärkste Konkurrent ist nicht eine andere App, sondern die Frage an die nächste Mitarbeiterin.

**Produkt oder Prototyp?**
Prototyp. Ein Produkt bräuchte gepflegte Daten ohne Entwickler, Betrieb ohne Schulcloud und einen zahlenden Kunden.

**Ist die Pflege der Produktpositionen zu aufwendig?**
Bei manueller Erfassung für einen ganzen Markt: wahrscheinlich ja. Ein mittelgroßer Supermarkt hat tausende Artikel und ändert Platzierungen laufend. Realistisch nur mit Import aus Planogramm-/Warenwirtschaftsdaten des Händlers. Im Pilot messen wir den Aufwand und sagen ehrlich, was das bedeutet.

**Gibt es ausreichend Interesse bei Betreibern?**
Nicht belegt. Öffentliche Akzeptanzdaten zu Indoor-Navigation im Lebensmittelhandel sind rar; frühere Beacon-Pilotprojekte im Handel haben sich nicht breit durchgesetzt. Ein Schulprojekt hat aber einen eigenen Hebel: regionale Unterstützung des Nachwuchses.

**Woran kann es scheitern?**
Am wahrscheinlichsten nicht an der Software, sondern an (1) keinem Partner, (2) zu ungenauer Ortung ohne Rückfallebene, (3) zu hohem Erfassungsaufwand, (4) Zeitmangel kurz vor Abgabe der Diplomarbeit.

**Was haben wir unterschätzt?**
- Dass Feldtests der eigentliche Engpass sind, nicht Algorithmen.
- Dass für Kunden die Regalbeschreibung wichtiger ist als der blaue Punkt.
- Den Aufwand für Daten.
- Die Kosten paralleler Großbaustellen (Admin-Neubau, Werbefilm, Android-Plan, Upsell) für den Kernpfad.

**Was streichen oder verschieben?**
Siehe STOP-DOING-Liste in [07_ACTION_PLAN.md](07_ACTION_PLAN.md), Abschnitt 5.

**Wo aufhören zu optimieren?**
Jetzt. Nach Integration des Stabilisierungs-Branches wird kein Positionsfilter, kein Schwellwert und kein Routing-Detail mehr ohne Aufnahme aus einem echten Raum geändert.

### Empfehlung: Partner jetzt suchen oder erst Technik?

**Beides parallel – das ist ausdrücklich möglich und richtig.** Kontaktaufnahme und technischer Pilot sind verschiedene Dinge:

- **Ab sofort:** Gespräche (Phase 1) mit Demo ohne Live-Ortung. Dauert erfahrungsgemäß Wochen bis zur Zusage; diese Zeit nutzt die Technik.
- **Erst nach Gate 6.1:** Termin für Phase 2 im Markt.
- **Erst nach Phase 2:** Testpersonen im Markt (Phase 3).

Wer erst die Technik fertig machen will, bevor er mit Märkten spricht, verliert 4–8 Wochen, in denen die Partnersuche ohnehin parallel laufen könnte – und läuft Gefahr, weiter Dinge zu optimieren, die kein Betreiber braucht.
