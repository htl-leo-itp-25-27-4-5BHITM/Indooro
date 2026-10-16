# Sprint 1 – „Pilotfähig im Testraum“

**Zeitraum:** Mo 19.10. – Fr 30.10.2026 (2 Wochen). Achtung: 26.10. Nationalfeiertag, danach Herbstferien (im Schulkalender prüfen). Die Kapazität in Woche 2 hängt davon ab, wer in den Ferien arbeitet. Agenten laufen trotzdem.

**Sprintziel:** Am 30.10. läuft ein Pilot-Build auf einem echten iPhone. Er führt auch ohne Ortung zum Regal und beschreibt den Ort in Worten. Der neue Admin ist live und abgesichert. Die erste echte Messung im Testraum ist ausgewertet. Pilot-Kit und Kontaktliste sind fertig, die ersten Marktgespräche sind geführt.

**Schätzung:** Story Points (1, 2, 3, 5, 8, 13). Code schreiben überwiegend die Agenten. Punkte bewerten Komplexität und Risiko, nicht Agentenzeit. Mensch-Aufgaben (Messen, Gespräche, Bestellung) zählen voll.

## Sprint Backlog

| ID | User Story | Akzeptanzkriterien | Wer | Change / Tasks | SP |
|---|---|---|---|---|---|
| **US-01** | Als **Kundin** möchte ich nach jedem Produkt suchen können, auch mit „&“ oder „+“, und eine klare Meldung sehen, wenn etwas schiefgeht, damit ich nicht vor einer leeren Liste stehe. | „Milch & Käse“ und „a+b“ finden Treffer. Serverfehler zeigt „Suche fehlgeschlagen“ und „Erneut versuchen“. Ohne Treffer erscheint „Keine Treffer für …“. | Person A | `prepare-pilot-ios-build` 4.x | 3 |
| **US-02** | Als **Kundin** möchte ich eine ruhige, deutsche App ohne Fachbegriffe und ohne Berechtigungsabfragen beim ersten Start, damit ich sie ohne Erklärung verstehe. | Kein „Debug“, „Tracking“ oder „Beacon“ in Release. Einführung erscheint einmal. Berechtigungen werden erst bei „Mit Ortung“ abgefragt. Ist Bluetooth aus, erscheint ein Banner. | Person A | `prepare-pilot-ios-build` 2, 3, 5 | 5 |
| **US-03** | Als **Testteam** möchten wir die Pilot-App mit Icon auf unseren iPhones installieren, damit wir im Markt testen können. | Asset-Katalog vorhanden. Mindest-iOS passt zu allen Team-Geräten. Installation auf ≥ 2 iPhones ist in `DEVICES.md` dokumentiert. | Person A | `prepare-pilot-ios-build` 6, 7.3 | 3 |
| **US-04** | Als **Kundin ohne funktionierende Ortung** möchte ich trotzdem eine Route sehen: vom Eingang und danach vom zuletzt erledigten Regal, damit ich geführt werde. | Tests: Tourstart ohne Position → Route ab Eingang. „Erledigt“ → Route ab letztem Stopp. Eine vertrauenswürdige Position ersetzt den Fallback genau einmal. Panel zeigt „Route ab …“. | Erik | `add-pilot-guided-tour-fallbacks` 2, 4.4 | 5 |
| **US-05** | Als **Kundin** möchte ich lesen, wo das Produkt steht („Gang 4 · links · Backzutaten, 3. Boden von unten“) statt eines Codes, damit ich es im Markt finde. | Kein Kategoriecode in der Kundenansicht. Regal ohne Bezeichnung → „Regal <Meter>“. Ohne Treffer → „Nicht im Testbereich – bitte Personal fragen“. Tests grün. | Erik | `add-pilot-guided-tour-fallbacks` 5 | 3 |
| **US-06** | Als **Kundin** möchte ich mit „Ich bin hier“ meine Position korrigieren und sehen, wann die Ortung unsicher ist, damit ich der Karte vertrauen kann. | Button funktioniert unabhängig von „Tippen setzt Ziel“. Unsichere Position halbtransparent mit Ring. Banner „Position ungenau“. | Erik | `add-pilot-guided-tour-fallbacks` 3, 4 | 5 |
| **US-07** | Als **Kundin im Markt mit schlechtem Netz** möchte ich, dass die App den zuletzt geladenen Markt offline zeigt, damit sie nicht auf den Testraum zurückfällt. | Flugmodus nach erstem Laden: Pilotmarkt sichtbar, Hinweis „Offline-Kopie vom …“. | Erik | `add-pilot-guided-tour-fallbacks` 6 | 3 |
| **US-08** | Als **Projektteam** möchten wir den neuen Admin live haben, mit Backup vorher, damit wir einen echten Markt erfassen können. | PR #105 gemergt. Backup vorhanden. Rollout ok, Smoke grün. Release ist dokumentiert. `main` ist in `pilot/first-store` gemergt, Konflikte gelöst, Tests grün. | Erik (+ Admin-Agent) | Pilot-Cut, `add-pilot-guided-tour-fallbacks` 7 | 5 |
| **US-09** | Als **Betreiber** möchte ich, dass unsere Daten auf dem Server geschützt und wiederherstellbar sind, damit ein Pilot kein Risiko ist. | OpenSearch nicht von außen erreichbar. Keine Klartext-Passwörter im Repo. Backup-, Restore- und Smoke-Skripte mit Tests, lokale Restore-Probe dokumentiert. | Person B | `release-pilot-backend` 1–3 | 8 |
| **US-10** | Als **Entwicklungsteam** möchten wir, dass CI Tests ausführt und Images mit Commit-SHA taggt, damit jeder Release nachvollziehbar und rückrollbar ist. | `ci.yaml` mit `mvn verify` und SHA-Tag. `RELEASE_RUNBOOK.md` und `SECRET_ROTATION.md` vorhanden. | Person B | `release-pilot-backend` 4 | 3 |
| **US-11** | Als **Betreiber** möchte ich, dass niemand anonym Daten ändern oder PDFs hochladen kann, damit der Markt-Datenbestand sicher ist. | Alle Tasks von `protect-legacy-write-endpoints` erledigt, Rollen-Matrix-Tests grün, PR nach `main`. | Person B | `release-pilot-backend` 5 | 8 |
| **US-12** | Als **Testteam** möchten wir einen festen Beacon-Standard und bestellte Hardware, damit Messungen vergleichbar sind. | `BEACON_STANDARD.md`, `HARDWARE_SELECTION.md` und `beacons.csv` vorhanden. Bestellung ausgelöst (Budget freigegeben). | Person C | `establish-pilot-field-measurement` 2 | 3 |
| **US-13** | Als **Projektteam** möchten wir die erste echte Messung der Ortung im Testraum, damit wir wissen, wie genau sie wirklich ist. | Testraum vermessen, Layout korrigiert. ≥ 3 Aufnahmen anonymisiert im Repo, Replay-Tests grün. Bericht mit Median-/P90-Fehler. | Person C (Messen, Analyse) + Erik (Replay, Fixtures) | `establish-pilot-field-measurement` 3, 4, 5.1–5.2 | 8 |
| **US-14** | Als **Datenerfasser** möchte ich eine Produkttabelle aus Excel importieren und sofort sehen, welche Zeile auf kein Regal passt, damit keine falschen Ziele im Markt landen. | Vorlage-CSV. `csv_to_ndjson.py` mit allen Prüfungen. Tests laufen unter Windows grün. Layout-Konventionen dokumentiert. | Person C | `prepare-pilot-store-operations` 2, 3 | 5 |
| **US-15** | Als **Marktbetreiber** möchte ich vor dem Test eine Seite mit Ablauf, Vereinbarung und Einwilligung sehen, damit ich weiß, worauf ich mich einlasse. | One-Pager, Brief, Pilotvereinbarung, Einwilligung (auch minderjährig), Fragebogen, Testprotokoll, Hinweisschild. PDFs erstellt oder Hinweis. | Person C | `prepare-pilot-store-operations` 4 | 3 |
| **US-16** | Als **Projektleitung** möchte ich mindestens 3 Gespräche mit Märkten und Klarheit über den Markt „Posttraße“, damit wir einen Pilotpartner bekommen. | Betreuungstermin hat stattgefunden. „Posttraße“ geklärt. ≥ 8 Märkte in der Kontaktliste (außerhalb des Repos). ≥ 3 Gespräche geführt, Ergebnis in `STATUS.md`. | Erik + Person C | Mensch | 5 |

**Summe:** 75 SP.

## Stretch (falls Zeit oder Agenten-Kontingent übrig)

| ID | User Story | Wer | Change | SP |
|---|---|---|---|---|
| US-17 | Als **Entwicklungsteam** möchten wir App-Tests und Swift-CI, damit auch Windows-Kollegen Regressionen sehen. | Erik | `add-ios-app-test-target` | 5 |
| US-18 | Als **Testteam** möchten wir wissen, wie viele Beacons wir wohin kleben, bevor wir kaufen und montieren. | Person C | `add-beacon-placement-planner` | 5 |
| US-19 | Als **Kundin** möchte ich auch bei gedrehten Regalen korrekt geführt werden. | Erik | `add-pilot-guided-tour-fallbacks` 9 | 3 |
| US-20 | Als **Datenerfasser** möchte ich eine Seite „Pilot-Bereitschaft“, die Layout, Produkte und Beacons prüft. | Erik | `add-store-pilot-readiness-check` | 8 |

## Danach: Sprint 2 (02.11. – 13.11.), Vorschau

Studienmodus (Person A), Messung im großen Raum und Kalibrierung (C + Erik), Pilot-Bereitschaftsseite (Erik), Auswertungswerkzeug (C), erster Pilot-Release mit Härtung (B + Erik). Ziel ist das Gate „bereit für den Markt“ und eine Zusage eines Marktes.

## Definition of Done (für jede Story)

- Tasks der Change in `tasks.md` abgehakt. Abweichungen stehen in `design.md`.
- Prüfungen aus `AGENT_RULES.md` grün, Ausgaben im Pull Request.
- PR von Erik geprüft und gemergt.
- `STATUS.md` aktualisiert.
- Bei UI: Screenshots unter `docs/pilot-readiness/evidence/…`.
- Mensch-Aufgaben: Ergebnis in `STATUS.md` notiert.

## Sprint-Review am 30.10. – was wir zeigen

1. iPhone im Testraum: Produkt suchen, Ort in Worten lesen, Route vom Eingang, „Erledigt“, Route vom letzten Regal, „Ich bin hier“.
2. Messbericht Testraum: Median- und P90-Fehler.
3. Neuer Admin live, Backup und Smoke-Check vorgeführt.
4. Pilot-Kit ausgedruckt, Stand der Marktgespräche.
