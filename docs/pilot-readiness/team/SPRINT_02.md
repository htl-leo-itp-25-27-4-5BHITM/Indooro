# Sprint 2 – „Bereit für den Markt“

**Zeitraum:** Mo 02.11. – Fr 13.11.2026 (2 Wochen).

**Sprintziel:** Am 13.11. besteht Indooro das Gate „bereit für den Markt“ (`03_PILOT_READINESS.md`):
- Der Pilot-Build mit Studienmodus läuft auf den Team-iPhones.
- Android-Kunden finden Produkte über den Web-Finder per QR-Code.
- Die Suche versteht Deutsch, und die Produkte gehören zu einem Markt.
- Der Server ist gehärtet.
- Die Ortung ist im großen Raum gemessen und kalibriert.
- Ein Markt hat für den Pilot zugesagt.

**Schätzung:** wie in Sprint 1 (Story Points 1, 2, 3, 5, 8, 13). Die Punkte bewerten Komplexität und Risiko, nicht die Agentenzeit.

## Stand vor dem Sprint (bereits erledigt)

Diese Teile sind schon vor Sprint 2 fertig geworden, gemergt und zum Teil live (`:a47c5e6` seit 17.10.):

- **Geführte Tour ohne Ortung (#113):** Route ab Eingang bzw. letztem Stopp, „Ich bin hier“, Regal in Worten, Offline-Start, gedrehte Regale.
- **Tests (#114, #118):** App-Test-Target, UI-Test-Target mit 8 UI-Tests, iOS-CI.
- **QR-Anker (#117):** Scanner mit einem Scan auch über einen Marktwechsel, Anker-Werkzeug im Editor, Druckseite. Am iPhone 13 gegen den Mock geprüft.
- **Seite „Pilot-Bereitschaft“ (#116):** live.
- **Replay-Export und Basisbericht für die Feldmessung (#115).**
- **Grundriss-Vorlage im Editor (#111):** live.

In Arbeit (Agenten):
- Bewegungsdaten im Recorder und Bewegungsmodell hinter dem Schalter `motionAided`, standardmäßig aus.
- Neuer Editor als Standard.

**Übertrag:** Stories aus Sprint 1, die am 30.10. nicht fertig sind, kommen zuerst. Vermutlich betrifft das US-01 bis US-03 (Person A, PR fehlt noch), US-09 bis US-11 (Person B) und US-12 bis US-15 (Person C). Im Sprint Planning am 02.11. legen wir sie konkret fest.

## Sprint Backlog

| ID | User Story | Akzeptanzkriterien | Wer | Change / Tasks | SP |
|---|---|---|---|---|---|
| **US-21** | Als **Testleitung** möchte ich einen Studienmodus mit Export, damit jeder Testlauf auswertbar ist. | Der Modus lässt sich nur mit einer Geste bzw. einem Code aktivieren. Er zählt Routenaufbau, Reroutes, „Ich bin hier“ und Stopp-Wechsel (Zähler aus #113). Export als Datei. UI-Test 3.5 aus `add-ios-pilot-ui-tests` ist nachgezogen. | Person A (+ Erik: UI-Test) | `add-pilot-study-mode` | 8 |
| **US-22** | Als **Testteam** möchten wir den Pilot-Build mit Tour, QR-Scanner und Studienmodus auf allen Team-iPhones, damit wir im Markt testen können. | PR `pilot/ios-pilot-build` gemergt und `pilot/first-store` eingemergt, beide Test-Targets bleiben erhalten. Installation per `scripts/ios/install-debug-on-device.sh` auf ≥ 2 iPhones, eingetragen in `DEVICES.md`. Kamera-Text nennt auch QR-Codes. | Person A + Erik | `prepare-pilot-ios-build` (Rest) | 3 |
| **US-23** | Als **Betreiber** möchte ich einen gehärteten Server mit festen Image-Tags und geänderten Passwörtern, damit der Pilot kein Sicherheitsrisiko ist. | Phase B von `release-pilot-backend` erledigt. `k8s/backend.yaml` nutzt feste Tags. Demo-Passwörter rotiert, keine Klartext-Secrets im Repo. Backup- und Restore-Probe dokumentiert. | Person B (+ Erik: Rollout) | `release-pilot-backend` Phase B | 8 |
| **US-24** | Als **Marktbetreiber** möchte ich, dass meine Produkte nur zu meinem Markt gehören, damit Kunden keine fremden Regale sehen. | Produkte haben eine `storeId`. Suche und Bereitschaftsseite filtern je Markt. Bestehende 153 Produkte sind migriert. Tests grün. | Person B | `add-store-scoped-catalog` | 5 |
| **US-25** | Als **Kundin** möchte ich „Paradeiser“, „Topfen“ oder „Kase“ eintippen und trotzdem das Richtige finden, damit die Suche wie ein Mensch versteht. | Deutsche Wortteile, Umlaut-Toleranz, Synonymliste. Treffer schon beim Tippen. Gemessene Suchqualität mit Testset, vorher und nachher. | Person B | `improve-product-search-quality` | 8 |
| **US-26** | Als **Android-Kundin** möchte ich am Eingang einen QR-Code scannen und im Browser sehen, wo mein Produkt steht, ohne eine App zu installieren. | Web-Finder unter `/customer/` mit Suche, Karte und Regal in Worten. Der Link aus dem QR-Code öffnet den richtigen Markt. Funktioniert auf Android-Chrome und iOS-Safari. Browser-Tests grün. | Person C | `upgrade-customer-web-product-finder` | 8 |
| **US-27** | Als **Testteam** möchten wir wissen, wie viele Beacons wir wohin kleben, bevor wir montieren. | Planer berechnet Positionen und Anzahl für ein Layout. Das Ergebnis passt zur Abdeckungsregel aus US-32. Ausgabe als Liste und Skizze. | Person C | `add-beacon-placement-planner` | 5 |
| **US-28** | Als **Projektteam** möchten wir die Ortung im großen Raum messen und kalibrieren, damit wir den Pilotmodus (A/B/C) begründet wählen. | ≥ 2 Aufnahmen im großen Raum mit dem aktuellen DEBUG-Build (inklusive Schritt- und Kompassdaten), anonymisiert im Repo. Replay und Bericht mit Median-/P90-Fehler. Pilotmodus entschieden und in `STATUS.md` festgehalten. | Person C (Messen) + Erik (Replay, Kalibrierung) | `establish-pilot-field-measurement` 5.3 ff., 6; `stabilize-ios-navigation-pipeline` 12.x | 8 |
| **US-29** | Als **Projektteam** möchten wir wissen, ob Schrittzähler und Kompass die Ortung ruhiger machen, damit wir das nur mit Beleg einschalten. | Replay aller echten Aufnahmen mit `motionAided` aus und an. Tabelle in `BASELINE.md`. Entscheidung dokumentiert, standardmäßig bleibt der Schalter aus, bis die Werte besser sind. | Erik | `improve-positioning-with-motion` 4.x | 5 |
| **US-30** | Als **Datenerfasser** möchte ich den neuen Editor als Standard, damit ich Grundriss, Regale, Beacons und QR-Anker an einem Ort pflege. | Alle P0-Lücken aus `EDITOR_EVIDENCE_GAPS.md` mit Tests geschlossen. Route `editor: true`, Rückschalten dokumentiert. Release mit Backup und Smoke-Check. | Erik (Agent) | `complete-admin-parity-evidence` | 8 |
| **US-31** | Als **Datenerfasser** möchte ich eine Abdeckungsregel, die für echte Märkte passt, damit die Bereitschaftsseite nicht bei jedem Layout warnt. | Radius, Schwelle und Mindestanzahl Beacons sind im Team entschieden und begründet. Regel und Tests sind angepasst. Planer (US-27) und Bereitschaftsseite verwenden dieselbe Regel. | Erik (+ Team-Entscheidung) | `add-store-pilot-readiness-check` (Folgeänderung) | 2 |
| **US-32** | Als **Admin** möchte ich, dass Login und Rollen im Live-Admin sicher funktionieren, damit Märkte nur ihre eigenen Daten sehen. | Abnahme mit admin, region-manager und store-manager: Login, Logout, eigene und fremde Märkte, Pilot-Bereitschaft, QR-Druck. Ergebnis in `STATUS.md`. | Erik | Mensch | 1 |
| **US-33** | Als **Projektleitung** möchte ich eine schriftliche Zusage eines Marktes mit Termin, damit Phase 2 im Markt im Sprint 3 starten kann. | Pilotvereinbarung unterschrieben bzw. per Mail bestätigt. Grundriss und Produktliste angefragt. Termin für die Erfassung steht. | Erik + Person C | Mensch | 5 |

**Summe:** 74 SP.

## Stretch

| ID | User Story | Wer | Change | SP |
|---|---|---|---|---|
| US-34 | Als **Projektteam** möchten wir Testläufe automatisch gegen die Pilot-Kriterien auswerten. | Person C oder B (wer zuerst frei ist) | `prepare-pilot-evaluation` | 5 |
| US-35 | Als **Marktbetreiber** möchte ich meine Produkt-Excel selbst importieren, mit Prüfung jeder Zeile. | Person B (nach US-24) | `add-admin-catalog-spreadsheet-import` | 5 |
| US-36 | Als **Datenerfasser** möchte ich die Beacon-Abdeckung live im Editor sehen. | Person C (nach US-27 und US-30) | `add-editor-beacon-coverage-overlay` | 5 |
| US-37 | Als **Kundin mit großer Schrift oder VoiceOver** möchte ich die App vollständig bedienen können. | Person A (nach US-21) | `improve-ios-accessibility` | 5 |

## Abhängigkeiten im Sprint

```
US-22 (A-PR gemergt) ─► US-21 UI-Test 3.5 ─► Studienmodus im Markt
US-31 Regel ─► US-27 Planer ─► Beacon-Montage im Markt
US-28 Aufnahmen ─► US-29 Bewegung bewerten ─► Pilotmodus
US-24 storeId ─► US-35 Import, Bereitschaftsseite je Markt
US-23 Härtung ─► jeder weitere Release (US-30)
```

## Definition of Done

Wie in `SPRINT_01.md`. Zusätzlich gilt: Jeder Release läuft mit Backup, festem Image-Tag und Smoke-Check und ist unter `docs/pilot-readiness/releases/` dokumentiert.

## Sprint-Review am 13.11. – was wir zeigen

1. Android-Handy: QR-Code am Eingang scannen, Produkt im Browser finden.
2. iPhone: Tour mit Studienmodus und Export, QR-Anker setzt die Position.
3. Suche: „Paradeiser“ und „Topfen“ finden Treffer, Kennzahl vorher und nachher.
4. Messbericht großer Raum und Entscheidung zum Pilotmodus.
5. Neuer Editor: einen Markt aus der Grundriss-Vorlage nachzeichnen, Bereitschaftsseite wird grün.
6. Zusage des Pilotmarkts.
