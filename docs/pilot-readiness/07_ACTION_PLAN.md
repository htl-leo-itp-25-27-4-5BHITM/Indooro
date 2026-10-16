# 07 – Maßnahmenplan: Die nächsten acht Wochen

Stand: 2026-10-15 · Woche 1 beginnt am Montag, 19.10.2026. Woche 8 endet am 11.12.2026.

Bezug: Blocker K1–K9 und Gates aus [03_PILOT_READINESS.md](03_PILOT_READINESS.md), Ablauf vor Ort aus [05_PILOT_IMPLEMENTATION.md](05_PILOT_IMPLEMENTATION.md), Material aus [06_BUSINESS_OUTREACH.md](06_BUSINESS_OUTREACH.md).

Aufwand: **S** < 0,5 Tag · **M** 1–2 Tage · **L** 3–5 Tage (Personentage). Keine Annahmen über verfügbare Stunden einzelner Teammitglieder.

> **Aktualisiert am 16.10.2026:** Die verbindliche Aufgabenverteilung (2 Mac, 2 Windows), alle OpenSpec-Changes und Branches stehen jetzt in [team/ROADMAP.md](team/ROADMAP.md) und [team/README.md](team/README.md). Die Rollen in Abschnitt 2 unten sind dadurch ersetzt.

---

## 1. Rahmenbedingungen, die den Plan bestimmen

- **Herbstferien** (voraussichtlich 26.10.–31.10.2026, in Oberösterreich bitte im Schulkalender prüfen): Schule und Testraum eventuell nicht zugänglich; gute Zeit für Marktbesuche, wenn das Team verfügbar ist.
- **Weihnachtsgeschäft ab Ende November:** Supermärkte haben im Dezember wenig Zeit und volle Gänge. **Phase 2 sollte vor ca. 28.11. stattfinden** oder bewusst auf Mitte Jänner verschoben werden.
- **Projektende Mitte Schuljahr 2026/27** (README): Phase 3 muss spätestens im Jänner/Februar 2027 laufen, damit Ergebnisse in die Diplomarbeit einfließen.
- Kritischer Pfad ist **die Partnerzusage**, nicht der Code.

---

## 2. Teamaufteilung (Vorschlag)

Angelehnt an die Projektorganisation im README und die tatsächliche Commit-Historie. Das Team entscheidet selbst.

| Rolle | Verantwortung | Vorschlag |
|---|---|---|
| **R1 iOS & Navigation** | Pilot-Branch, Pilot-Build, UI-Fixes, Release auf Testgeräten | Erik Bergmair (+ David Berghahn) |
| **R2 Positionierung & Hardware** | Beacon-Kauf, Konfiguration, Montageplan, Messläufe, Auswertung | Michael Stelzmüller + David Berghahn (laut README „Anbindung der Ortungshardware“) |
| **R3 Daten, Admin & Backend** | Layout des Pilotmarkts, Produkterfassung, Import, Backend-Sicherheit, Backup | Fabian Joos + Niilo Rieser (laut README „Server“) |
| **R4 Test & Qualität** | Testprotokolle, Gate-Prüfungen, Fragebogen, Einwilligungen, Messauswertung | rotierend; eine Person verantwortlich (nicht R1) |
| **R5 Partner & Pilotkoordination** | Kontakte, Gespräche, Vereinbarung, Termine, Schule | eine feste Person, **nicht** die Hauptperson für iOS |

**Wichtig:** Der Navigationscode muss von mindestens zwei Personen verstanden werden (Risiko M5). Aufgabe T-8 dient genau dazu.

---

## 3. Aufgabenliste

### 3.1 Technik

| ID | Aufgabe | Prio | Aufwand | Abhängigkeit | Rolle | Ergebnis | Abnahmekriterium |
|---|---|---|---|---|---|---|---|
| T-1 | `codex/stabilize-ios-navigation` und `codex/admin-platform-rebuild` pushen | P0 | S | – | R1 | Branches auf GitHub | Remote-Tip = lokaler Tip |
| T-2 | Integrationsbranch `pilot/first-store`: Stabilisierung auf `main`, 3 Konflikte lösen (Regalzuordnung der Stabilisierung behalten) | P0 | M | T-1 | R1 | Ein Branch für den Pilot | `swift test` 77/77 grün, App startet im Simulator |
| T-3 | Pilot-Build-Konfiguration: Upsell, AR, Auto-Markterkennung aus; Rezepte-Tab ausblenden; „Debug (kein Beacon)“ → „Ohne Ortung“; alle sichtbaren Texte Deutsch | P0 | M | T-2 | R1 | Ruhige, fokussierte App | Kein englischer Begriff in Kundenansicht; kein Upsell-Request im Netzwerk-Log |
| T-4 | Regalbeschreibung für Kunden: Label des Regals (z. B. „Gang 4 · links · Backzutaten“) und Fach/Reihe als „2. Boden von unten“ anzeigen; Label im Layout pflegbar | P0 | M | T-2 | R1 + R3 | Lesbare Ortsangabe | 20 Produkte: Text stimmt mit Beschilderung des Pilotbereichs überein |
| T-5 | Rückfall-Startpunkt: Eingang bei Tourstart, danach Regal des zuletzt erledigten Stopps; sichtbarer Knopf „Ich bin hier“ | P0 | M | T-2 | R1 | Route auch ohne Ortung | Test in `NavigationSessionTests`: ohne Position wird Route vom Eingang gezeichnet; nach „Erledigt“ vom erledigten Regal |
| T-6 | Ursache der 17-m-Sprünge in den Replays `determinism`/`wrongAisle` klären | P1 | S–M | T-2 | R1 | Erklärung oder Fix | Replay-Metrik `maxStep` erklärt und dokumentiert |
| T-7 | Suche: `URLQueryItem` statt `urlQueryAllowed`; Meldungen für „keine Treffer“, „kein Netz“, „Produkt nicht im Testbereich“ | P0 | S | T-2 | R1 | Robuste Suche | 20 Testbegriffe inkl. „Milch & Käse“, „a+b“ korrekt |
| T-8 | Code-Walkthrough Navigation für das ganze Team (1 Termin, 90 min), anhand [docs/NAVIGATION_REVIEW.md](../NAVIGATION_REVIEW.md) und Testpaket | P1 | S | T-2 | R1 | Wissen verteilt | Zwei weitere Personen können `swift test` und einen Replay ausführen und erklären |
| T-9 | Offline-Robustheit: zuletzt geladenes Layout und Produktliste des Pilotmarkts auf dem Gerät speichern, Fallback darauf statt Testraum | P0 | M | T-2 | R1 | Funktioniert ohne Netz | Flugmodus nach erstem Laden: Suche, Karte, Liste funktionieren |
| T-10 | Verteilung: Asset-Katalog (App-Icon), Mindest-iOS an Testgeräte anpassen, Bundle aufräumen (README/Präsentation aus dem Target), Netzwerk-Timeouts setzen; Installation auf 2–3 iPhones (verschiedene Modelle) | P0 | M | T-2 | R1 | Testgeräte bereit | App auf allen Geräten installiert, startet, Recorder schreibt Datei |
| T-11 | Interner Build mit Recorder für Team-Geräte (DEBUG oder eigene Konfiguration) | P0 | S | T-10 | R1 | Messwerkzeug | Aufnahme lässt sich exportieren und im Replay abspielen |
| T-12 | Backend-Minimum: OpenSearch auf `ClusterIP`, Passwörter und Client-Secret rotieren und aus dem Repo entfernen, ungeschützte PDF-Endpunkte absichern oder abschalten, `pg_dump`-Backup dokumentieren | P1 | M | – | R3 | Sicherer Betrieb | Port von außen nicht erreichbar; Backup + Restore einmal geprobt |
| T-13 | Entscheidung Admin: Für den Pilot den Admin verwenden, der heute zuverlässig läuft. Admin-Rebuild nur mergen/deployen, wenn seine 5 offenen Tasks in ≤ 2 Tagen erledigt sind | P1 | S | – | R3 | Klarheit | Schriftliche Entscheidung im Team-Kanal |
| T-14 | Import-Hilfe: Tabelle (CSV/Excel) → NDJSON-Skript für Produkte mit `layoutCode` | P1 | S | – | R3 | Schnelle Erfassung | 100 Zeilen in < 5 min importiert |
| T-15 | Einheit „1 Rasterzelle = 1 m“ in Editor und Doku festlegen | P1 | S | – | R3 | Eindeutiger Maßstab | In Editor-Hilfe und Layout-Doku vermerkt |

### 3.2 Positionierung und Hardware

| ID | Aufgabe | Prio | Aufwand | Abhängigkeit | Rolle | Ergebnis | Abnahmekriterium |
|---|---|---|---|---|---|---|---|
| H-1 | Beacon-Modell auswählen (Kriterien in [05](05_PILOT_IMPLEMENTATION.md) 3.3), 12 Stück bestellen, Budget mit Schule klären | P0 | S | – | R2 | Hardware unterwegs | Bestellung bestätigt |
| H-2 | Konfigurationsstandard: UUID, Major = Markt, Minor = Nummer, Sendeleistung, Intervall; Konfigurationstabelle anlegen | P0 | S | H-1 | R2 | Einheitliche Beacons | Alle Beacons beschriftet und in Tabelle |
| H-3 | **Erster echter Messlauf im Testraum** mit vorhandenen 4 Beacons und Recorder: 4 Stillstandspunkte × 60 s, 3 Gehrunden, Bodenmarken | P0 | M | T-11 | R2 + R4 | Erste Felddaten | ≥ 3 Aufnahmen im Repo (anonymisiert), Replay-Metriken in `NavigationFixtures/BASELINE.md` |
| H-4 | Größerer Probelauf in einem Raum mit Regalen oder Gängen (z. B. Bibliothek, Werkstatt, Lager) mit 8 Beacons im 6–8-m-Raster | P0 | M | H-2, H-3 | R2 + R4 | Daten nahe Supermarktbedingungen | Positionsfehler Median/90 % dokumentiert |
| H-5 | Kalibrierung nur mit Daten: `provisional`-Werte anpassen, Off-Route-Schwelle relativ zum gemessenen Fehler setzen | P1 | M | H-4 | R1 + R2 | Belegte Parameter | Jede Änderung mit Aufnahme und Vorher/Nachher-Metrik begründet |
| H-6 | Messprotokoll und Montageplan für den Markt (Vorlage) | P1 | S | H-4 | R2 | Wiederholbares Vorgehen | Protokoll in [05](05_PILOT_IMPLEMENTATION.md) abgehakt anwendbar |

### 3.3 Partner und Organisation

| ID | Aufgabe | Prio | Aufwand | Abhängigkeit | Rolle | Ergebnis | Abnahmekriterium |
|---|---|---|---|---|---|---|---|
| O-1 | Strategie mit Betreuung besprechen: Absender, Schulbrief, Budget, Versicherung, Rechte, Vermittlung | P0 | S | – | R5 | Rückendeckung der Schule | Termin hat stattgefunden, Ergebnisse notiert |
| O-2 | Klären: Welcher Markt ist „SPAR Posttraße“? Woher stammen Layout und Belegplan? Arbeiten Teammitglieder dort? Ist es Filiale oder Kaufmann? | P0 | S | – | R5 | Erster Kandidat | Antwort dokumentiert; ggf. Repo-Sichtbarkeit und Datenherkunft geklärt |
| O-3 | Kontaktliste (Tabelle): 8–12 Märkte im Raum Leonding/Linz-Süd/Traun/Pasching, je Typ (Kaufmann/Filiale), Status, Entscheidungsbefugnis | P0 | S | – | R5 | Pipeline | ≥ 8 Einträge, davon ≥ 5 selbstständig geführt |
| O-4 | One-Pager, Brief, Einwilligungsformular, Fragebogen, Pilotvereinbarung finalisieren und drucken | P0 | S–M | O-1 | R5 + R4 | Material | Von Betreuung gegengelesen |
| O-5 | Demo-Gerät vorbereiten: Demo nach [06](06_BUSINESS_OUTREACH.md) F, offline geprobt | P0 | S | T-7 (bis dahin `main`-Build mit Debug-Modus) | R1 + R5 | Demo | 3 fehlerfreie Probedurchläufe im Flugmodus |
| O-6 | Erste Gespräche (persönlich / Brief / Vermittlung), Ziel ≥ 5 Gespräche bis Ende Woche 4 | P0 | M (verteilt) | O-3, O-4, O-5 | R5 (+1 Person) | Interessenten | ≥ 1 Zusage für Phase 2 oder klarer Entscheiderkontakt |
| O-7 | Pilotvereinbarung unterschreiben, Bereich und Termine festlegen | P0 | S | O-6 | R5 | Grünes Licht | Unterschrift Markt + Team + Betreuung |
| O-8 | Jugend Innovativ: Frist 2026/27 prüfen, ggf. Einreichung vorbereiten (stärkt Glaubwürdigkeit) | P2 | S | – | R5 | Option | Frist bekannt |

### 3.4 Pilot vor Ort

| ID | Aufgabe | Prio | Aufwand | Abhängigkeit | Rolle | Ergebnis | Abnahmekriterium |
|---|---|---|---|---|---|---|---|
| P-1 | Begehung + Vermessung des Pilotbereichs, Fotos der Regale | P0 | M | O-7 | R2 + R3 | Rohdaten | Maße und Fotos vollständig |
| P-2 | Layout zeichnen, Labels, veröffentlichen | P0 | M | P-1, T-4, T-15 | R3 | Digitaler Pilotbereich | Probelauf im Simulator ohne Validierungsfehler |
| P-3 | 100–200 Produkte erfassen und importieren | P0 | M | P-1, T-14 | R3 | Produktdaten | Stichprobe 20/20 korrekt |
| P-4 | Beacons montieren, Positionen eintragen, Messläufe (Protokoll H-6) | P0 | M | P-2, H-2 | R2 + R4 | Messdaten Markt | Aufnahmen + Metriken; Entscheidung Modus Phase 3 (Tabelle in 03, 4.3) |
| P-5 | Kurztest mit 3–5 Bekannten | P1 | S | P-4 | R4 | Erste Nutzerdaten | Protokoll ausgefüllt |
| P-6 | Phase-2-Bericht für den Markt (2 Seiten) | P0 | S | P-4, P-5 | R4 + R5 | Entscheidungsgrundlage | An Markt übergeben |

---

## 4. Zeitplan

### 4.1 Realistischer Plan

| Woche | Datum | Technik | Positionierung | Partner | Ergebnis am Ende der Woche |
|---|---|---|---|---|---|
| **1** | 19.–23.10. | T-1, T-2, T-7, T-13, T-15 | H-1, H-2 (soweit Hardware da) | O-1, O-2, O-3, O-4 | Pilot-Branch existiert und ist gepusht; Beacons bestellt; Kontaktliste; erster Kandidat geklärt |
| **2** | 26.–30.10. (Ferien?) | T-3, T-5, T-9 | – | O-5; erste Marktbesuche (Ferien = mehr Zeit) | Demo bereit; 2–3 Gespräche |
| **3** | 02.–06.11. | T-4, T-10, T-11, T-8 | **H-3 Testraum** | O-6 | Pilot-Build auf iPhones, erste echte Aufnahmen |
| **4** | 09.–13.11. | T-6, T-12, T-14 | H-4 größerer Raum | O-6, O-7 | **Gate 6.1 erfüllt**; ≥ 5 Gespräche; idealerweise 1 Zusage |
| **5** | 16.–20.11. | Bugfixes aus H-4 | H-5, H-6 | O-7 | Vereinbarung unterschrieben |
| **6** | 23.–27.11. | Bereitschaft vor Ort | P-1, P-2, P-3 | Termine fixiert | Pilotbereich digital erfasst |
| **7** | 30.11.–04.12. | – | **P-4 Montage + Messung im Markt** | – | Erste Messdaten im echten Markt |
| **8** | 07.–11.12. | Auswertung, Fixes | P-5, P-6 | Bericht übergeben, Phase 3 vereinbaren | **Phase 2 abgeschlossen**; Phase 3 für Jänner geplant |

**Bewertung:** Ein **technischer Test im Markt (Phase 2) innerhalb von acht Wochen ist realistisch**, wenn bis Ende Woche 4 eine Zusage vorliegt. Ein **Praxistest mit Testpersonen (Phase 3) innerhalb von acht Wochen ist nicht realistisch** und wegen des Weihnachtsgeschäfts auch nicht sinnvoll. Phase 3: Mitte bis Ende Jänner 2027.

Größtes Planrisiko: Keine Zusage bis Woche 5. Dann Phase 2 im Jänner und bis dahin H-4 vertiefen (größere Testfläche, ggf. Baumarkt oder Lager eines Bekannten als Zwischenstufe).

### 4.2 Beschleunigter Plan (wenn der „Posttraße“-Markt oder ein Arbeitgeber-Markt schnell zusagt)

| Woche | Inhalt |
|---|---|
| 1 | T-1, T-2, T-7; O-1, O-2; Gespräch mit dem bekannten Markt; H-1 Expressbestellung |
| 2 | T-3, T-5, T-9, T-10, T-11; Vermessung des Pilotbereichs (P-1) in den Ferien; vorhandenes Posttraße-Layout als Basis prüfen |
| 3 | H-3 Testraum + P-2/P-3; Gate 6.1 |
| 4 | **P-4 im Markt** (vor dem Weihnachtsgeschäft) |
| 5–6 | Auswertung, Kalibrierung, P-5 |
| 7–8 | Kleine Phase 3 mit 10–15 Testpersonen aus dem Umfeld, wenn der Markt zustimmt; sonst Jänner |

Voraussetzung: Zusage in Woche 1–2. Ohne bekannten Markt nicht erreichbar.

### 4.3 Kleinste Pilotvariante, die früher möglich ist

**„Produktfinder-Test“ (Variante B) in Woche 4–5:** keine Beacons im Markt, nur Vermessung eines Bereichs, 100 Produkte, 3–5 Testpersonen mit Leihgeräten, Suchzeit mit/ohne App. Aufwand für den Markt nahe null, Montagegenehmigung nicht nötig. Liefert früh eine Nutzenaussage und öffnet die Tür für Phase 2 mit Beacons.

---

## 5. STOP-DOING-Liste

Ab sofort bis zum Abschluss von Phase 2 **nicht** mehr:

| # | Aufhören mit | Warum (Beleg) |
|---|---|---|
| 1 | **Neue Positionsfilter, Schwellwerte oder Routing-Optimierungen ohne Aufnahme aus einem echten Raum** | Drei Komplexitätsschübe ohne Messdaten haben die Navigation verschlechtert (`37208b0`, `19ad495`, `1e6b243`, siehe NAVIGATION_REVIEW D). |
| 2 | **Werbefilm V2 / Blender / Remotion** | Zwei Branches, > 1,8 GB Projektordner, OpenSpec-Changes mit 60 Tasks; bringt keinen Markt näher. Wieder aufnehmen nach dem Pilot – dann mit echten Bildern aus dem Markt. |
| 3 | **Android-Planung** | Nur Dokumente, kein Code; verdoppelt den Testaufwand. |
| 4 | **KI-Upsell weiterentwickeln** (`stabilize-upsell-quality-and-request-lifecycle`, 135 offene Tasks) | Nicht Teil der Testfrage, wirft Daten- und Werbefragen beim Betreiber auf. |
| 5 | **Rezepte erweitern** | Kein Bezug zur Pilotfrage. |
| 6 | **AR-Experiment** | Kompassabhängig, ungetestet; erst nach belegter BLE-Ortung sinnvoll. |
| 7 | **Admin-Neubau ausbauen** (Rollen, Regionen, Barrierefreiheit des Editors, Parität) | 161 Commits für mehrere Filialen und Rollen, die im Pilot niemand braucht. Nur abschließen, was für einen Markt nötig ist (T-13). |
| 8 | **`modernize-ios-client-architecture` (62 Tasks), `optimize-backend-data-access`, `establish-shared-api-contract`** | Architekturarbeit ohne Nutzerwirkung vor dem Pilot. |
| 9 | **Neue OpenSpec-Changes für Nicht-Pilot-Themen** | Über 400 offene Tasks. Jede neue Change muss eine Pilotaufgabe aus diesem Plan sein. |
| 10 | **Funktionen für mehrere Märkte, Konten, Loyalty, Bilder, Bestände** | Siehe 03, Abschnitt 3.1 D. |
| 11 | **Android auf der Website ankündigen** | Die Website (Branch `website`) schreibt „Für iOS und Android. Aktuell in Entwicklung.“ Für Android gibt es keine Zeile Code. Ein Betreiber, der nachfragt, erhält ein falsches Bild. Bis es Code gibt: nur iOS nennen. |
| 12 | **Große Commits mit unklaren Nachrichten** („zweite App“, „restore“, „JaCoCo“ mit Navigationsänderungen) | Erschweren jede Fehlersuche. Eine Änderung = ein Commit mit ehrlicher Nachricht. |
| 13 | **Pixelarbeit an der UI**, die nicht in T-3/T-4/T-7 steht | Kunde braucht lesbare Ortsangabe, nicht Animationen. |

**Erlaubt bleibt:** alles in Abschnitt 3 dieses Plans, Bugfixes, die ein Testlauf zeigt, und die Diplomarbeitsdokumentation.

---

## 6. Diese Woche (bis Freitag, 23.10.2026)

1. **T-1:** Beide Arbeitsbranches pushen. (5 Minuten, verhindert Datenverlust.)
2. **O-2:** Im Team klären, welcher reale Markt im Layout „SPAR Posttraße“ steckt und wer dort Kontakt hat.
3. **O-1:** Termin mit der Betreuung: diese Dokumente vorstellen, Rückendeckung, Budget für 12 Beacons.
4. **H-1:** Beacon-Modell auswählen und bestellen.
5. **T-2:** Integrationsbranch `pilot/first-store` anlegen, Konflikte lösen, `swift test` grün.
6. **O-3:** Kontaktliste mit 8–12 Märkten beginnen.
7. **Team-Entscheidung:** Feature-Freeze und STOP-DOING-Liste beschließen.
