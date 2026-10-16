# 08 – Executive Summary: Indooro auf dem Weg in den ersten Supermarkt

Stand: 15.10.2026 · Für: Indooro-Team und Betreuung, HTL Leonding

Details: [01 Audit](01_PROJECT_AUDIT.md) · [02 Branches](02_BRANCH_ANALYSIS.md) · [03 Readiness](03_PILOT_READINESS.md) · [04 Strategie](04_FIRST_SUPERMARKET_STRATEGY.md) · [05 Umsetzung](05_PILOT_IMPLEMENTATION.md) · [06 Outreach](06_BUSINESS_OUTREACH.md) · [07 Maßnahmen](07_ACTION_PLAN.md)

---

## 1. Wo stehen wir wirklich?

Indooro ist ein großer, ernsthafter Prototyp: eine iOS-App mit rund 17.000 Zeilen Swift, ein Quarkus-Backend mit 142 Tests, eine Web-Verwaltung mit Layout-Editor, Keycloak, Kubernetes auf der Schul-Cloud und über 400 dokumentierte Spezifikations-Tasks.

**Aber:** Die zentrale Idee – Kunden per Bluetooth-Ortung im Supermarkt zum Produkt führen – wurde **noch nie außerhalb eines ca. 45 m² großen Klassenraums mit 4 Beacons ausprobiert**. Es gibt keine einzige aufgezeichnete Messung. Die angestrebte Genauigkeit „ca. 1 m“ aus der Spezifikation ist ein Ziel, kein Messwert, und für diese Technik im Supermarkt sehr unwahrscheinlich.

Gleichzeitig ist der beste Stand des Codes auf zwei Branches verteilt, die weder gemergt noch vollständig gepusht sind (`codex/stabilize-ios-navigation`, `codex/admin-platform-rebuild`), mit drei Konfliktdateien.

**Urteil:** Wir haben genug, um mit Märkten zu sprechen. Wir haben noch nicht genug, um in einem Markt zu testen – aber der Abstand beträgt etwa zwei bis drei Wochen fokussierter Arbeit, nicht Monate.

## 2. Was funktioniert bereits?

| Funktion | Beleg |
|---|---|
| Produktsuche, Produkt-Regal-Zuordnung, Grundrisskarte mit Zoom | Code vorhanden, im Simulator genutzt |
| Einkaufslisten, lokal gespeichert | Code vorhanden |
| **Stabile Navigation**: ein Besitzer für Route und Ziel, keine flatternden Ziele, deterministische Routen, Reihenfolge per Nearest Neighbor + 2-opt, Rerouting nur zum aktiven Ziel | **77 automatische Tests grün** (in dieser Analyse ausgeführt) – auf dem Stabilisierungs-Branch, nicht auf `main` |
| Aufzeichnung und Wiedergabe von Messläufen | Code + Tests vorhanden, im Feld nie benutzt |
| Backend mit Märkten, Beacons, Layout-Versionen | 142 Tests (letzter lokaler Lauf grün) |
| Layout-Editor mit Validierung beim Veröffentlichen | Admin-Branch, nicht deployt |
| Datenschutz: App sendet keine Position und keine Geräte-ID | Code geprüft |
| Ein realer SPAR-Markt („Posttraße“) ist bereits als Layout nachgezeichnet, Regaldaten liegen vor | Repository |

## 3. Was ist kritisch?

1. **Keine Felddaten zur Ortung.** Alles, was über Genauigkeit gesagt wird, ist Vermutung.
2. **Code-Stand zersplittert** auf ungemergten Branches; Hauptarbeit konzentriert auf eine Person und KI-Sessions.
3. **Die App sagt dem Kunden nicht verständlich, wo das Produkt steht**: Sie zeigt „Gang 310“ (interner Kategoriecode) statt „Gang 7, links“.
4. **Ohne Ortung zeichnet die App keine Route**, und die manuelle Positionskorrektur ist nicht sauber erreichbar.
5. **Ohne Netz** fällt die App auf den Klassenraum-Grundriss zurück.
6. **Backend offen**: Suchindex ohne Passwort erreichbar, Passwörter im Repository, kein Backup.
7. **Kein Pilotpartner** – und das ist der eigentliche Engpass.

## 4. Was fehlt zwingend?

Für den ersten Test im Markt (Details: 03, Abschnitt 3):

- Ein Integrationsbranch `pilot/first-store` mit Feature-Freeze.
- Lesbare Regalbeschreibung, Startpunkt „Eingang“ und „Ich bin hier“, Route auch ohne Ortung.
- Pilotmarkt-Daten offline auf dem Gerät.
- Suche ohne Sonderzeichen-Fehler, klare Fehlermeldungen.
- Pilot-Build ohne Upsell, AR, Rezepte und Debug-Begriffe; installiert auf 2–3 iPhones.
- **Erste echte Messläufe** im Testraum und in einem größeren Raum.
- 10–12 Beacons, Montage- und Messprotokoll.
- Einwilligungsformular, Fragebogen, einseitige Pilotvereinbarung.

## 5. Welchen Pilot zuerst?

**Hybrid-Pilot (Variante C) in drei Phasen**, so gebaut, dass er auch ohne genaue Ortung nützt:

- Die App zeigt **immer** markiertes Regal + Ortsangabe in Worten + Liste in Laufreihenfolge vom Eingang.
- Die Bluetooth-Position ist **Zusatz**: als ungefährer Bereich, korrigierbar per Tippen.
- Phase 2 **misst** die Ortung im echten Markt. Die Messung entscheidet, ob Phase 3 mit oder ohne Live-Ortung läuft (Schwellen in 03, Abschnitt 4.3).

| Phase | Umfang | Aufwand Markt |
|---|---|---|
| 1 Kennenlernen | 10-Minuten-Demo | 20–30 min |
| 2 Technischer Test | 1 Bereich (300–600 m²), 100–200 Produkte, 8–12 Beacons, nur Team-Handys, 2–3 Termine außerhalb der Stoßzeiten | ca. 1 h |
| 3 Praxistest | 15–30 Freiwillige, Suchaufgaben mit/ohne App, 1–2 Wochen | ca. 1 h + Abschlussgespräch |

Kosten für uns: Sachkosten ca. 150–500 € für Phase 2 und ca. 100–350 € für Phase 3 (vor allem Beacons), dazu ca. 75–135 Personenstunden für Einrichtung und Tests plus die Entwicklungsaufgaben. Für den Markt: kostenlos, jederzeit beendbar, keine Kundendaten.

## 6. Welche Art von Supermarkt ansprechen?

1. **Den SPAR-Markt, den das Team schon kennt** (Samstagsarbeit, „Posttraße“-Layout). Sofort klären, ob Filiale (dann braucht es die Zentrale) oder selbstständiger Kaufmann.
2. **Selbstständige SPAR-Kaufleute** in Leonding, Linz-Süd, Traun, Pasching, Ansfelden/Haid: entscheiden als Unternehmer weitgehend selbst, mittelgroße Märkte, sichtbarer Nutzen.
3. **ADEG- und Nah&Frisch-Kaufleute** im Umland: schnelle Zusage, eher kleine Märkte – gut als technische Testfläche.
4. Nicht jetzt: BILLA, HOFER, LIDL, PENNY (zentral gesteuert), Maximarkt/INTERSPAR (erst mit Ergebnissen, über Vermittlung).

Kontaktweg: **persönlich im Markt, per Brief oder über Vermittlung** (Betreuung, Familie, WKO). Keine Werbeanrufe und keine unaufgeforderten Werbe-E-Mails – laut WKO-Auslegung des § 174 TKG 2021 auch gegenüber Unternehmen nicht erlaubt.

Unser Hebel ist nicht der Business Case, sondern: **regionale Schule, ehrlicher kleiner Test, null Aufwand und null Risiko für den Markt, Ergebnisbericht als Gegenleistung.**

## 7. Was müssen wir diese Woche tun?

1. Beide Arbeitsbranches **pushen** (Datensicherung, 5 Minuten).
2. Klären: **Welcher Markt ist „Posttraße“**, wer hat dort Kontakt, Filiale oder Kaufmann, mit welcher Erlaubnis stammen Layout und Belegplan?
3. **Termin mit der Betreuung**: diese Analyse vorstellen, Schulbrief, Budget für 12 Beacons, Versicherung, Rechte.
4. **Beacons bestellen** (12 Stück, konfigurierbares iBeacon-Modell).
5. **Integrationsbranch** anlegen, Konflikte lösen, Tests grün.
6. **Kontaktliste** mit 8–12 Märkten beginnen.
7. **Feature-Freeze und STOP-DOING-Liste** beschließen (07, Abschnitt 5): kein Werbefilm, kein Android, kein Upsell, kein AR, kein Admin-Ausbau, keine neuen Filter ohne Messdaten.

## 8. Was in den kommenden Wochen?

| Wochen | Ziel |
|---|---|
| 1–2 | Pilot-Branch, Pilot-Build-Konfiguration, Demo-Gerät, Material, erste Gespräche |
| 3–4 | Pilot-Build auf iPhones, **erste echte Messläufe** (Testraum, größerer Raum), ≥ 5 Gespräche, Gate „bereit für Markt“ |
| 5–6 | Vereinbarung, Vermessung und Datenerfassung des Pilotbereichs |
| 7–8 | Beacons montieren, Messung im Markt, Kurztest mit Bekannten, Bericht an den Markt |
| Jänner | Phase 3 mit Testpersonen (nach dem Weihnachtsgeschäft) |

## 9. Wie realistisch ist ein Pilot in acht Wochen?

- **Technischer Test im echten Markt (Phase 2): realistisch**, wenn bis Ende Woche 4 (13.11.) ein Markt zusagt. Bevorzugt vor dem Weihnachtsgeschäft (bis ca. 28.11.), sonst Woche 7 mit kleinem Bereich.
- **Praxistest mit echten Testpersonen (Phase 3) in acht Wochen: nicht realistisch** und im Dezember auch nicht sinnvoll. Ziel: Jänner 2027.
- **Früheste Variante:** ein „Produktfinder-Test“ ohne Beacons (Variante B) in Woche 4–5, wenn der bekannte Markt zustimmt. Er braucht keine Montagegenehmigung und liefert früh eine Nutzenaussage.

---

## 10. Meine Gesamtempfehlung

Wenn ich ab morgen für Indooro verantwortlich wäre, würde ich Folgendes tun:

**1. Das Ziel umformulieren.** Nicht „Wir navigieren Kunden per Beacon zum Regal“, sondern „Wir zeigen in einem echten Markt, ob Kunden mit Indooro seltene Produkte schneller und ohne Nachfrage finden – und wir messen ehrlich, wie gut Bluetooth-Ortung dabei hilft.“ Diese Fragestellung ist mit unserem Stand beantwortbar, für einen Betreiber verständlich und für die Diplomarbeit wertvoller als eine Navigation, die im Markt vielleicht nicht funktioniert.

**2. Den Code einfrieren und zusammenführen.** Der Stabilisierungs-Branch ist der wertvollste Stand des Projekts. Ich würde ihn diese Woche pushen, mit den iOS-Fixes des Admin-Branches zusammenführen und ab dann nur noch die sieben Pilot-Aufgaben umsetzen (Regaltext, Startpunkt ohne Ortung, „Ich bin hier“, Offline-Daten, Suche, Pilot-Konfiguration, Verteilung). Kein neuer Filter, keine neue Architektur, kein Werbefilm, kein Android, kein Upsell, kein AR bis nach Phase 2.

**3. Sofort messen, nicht erst im Markt.** In Woche 3 die ersten echten Aufnahmen im Testraum, in Woche 4 in einem größeren Raum mit Regalen. Danach wissen wir zum ersten Mal, ob 3 m, 5 m oder 8 m Fehler realistisch sind – und können einem Betreiber ehrlich sagen, was er erwarten darf.

**4. Gleichzeitig mit Märkten reden – ab nächster Woche.** Zuerst mit dem SPAR-Markt, den das Team schon kennt, dann mit zwei bis drei selbstständigen Kaufleuten im Raum Leonding/Linz-Süd. Persönlich, mit Betreuung im Rücken, mit einer kleinen Bitte (10 Minuten Demo) und einem kostenlosen, auf drei Termine begrenzten technischen Test. Eine Person im Team macht ausschließlich das.

**5. Den Pilot so bauen, dass er nicht an der Ortung scheitern kann.** Die App muss auch ohne Bluetooth nützlich sein: markiertes Regal, Ortsangabe in Worten, Liste in Laufreihenfolge, Route vom Eingang und vom zuletzt erledigten Produkt. Die Ortung ist Zusatz und Messobjekt. Funktioniert sie gut – großartig. Funktioniert sie nicht – haben wir trotzdem einen Pilot, echte Nutzerdaten und eine ehrliche, messbare Erkenntnis für die Diplomarbeit.

**6. Den Weihnachtskalender respektieren.** Technischer Test bis Ende November, sonst Mitte Jänner. Praxistest im Jänner. Nicht im Dezember in einen vollen Supermarkt drängen.

**Die wichtigste Einzelentscheidung:** Ab dieser Woche ist jede Stunde, die nicht auf einen der sieben Pilot-Punkte, die Messläufe oder ein Gespräch mit einem Markt einzahlt, eine Stunde, die uns vom ersten Supermarkt fernhält.
