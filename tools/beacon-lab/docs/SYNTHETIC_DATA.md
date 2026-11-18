# Synthetische Daten

> **Synthetische Daten sind niemals Messergebnisse.** Sie entstehen aus einem Rechenmodell und beweisen nichts über
> reale Märkte, Beacons oder Geräte. Sie dienen ausschließlich dazu, die Auswertung (Filter, Verfahren, Metriken,
> Bericht) zu testen und Effekte wie Rauschen, Kalibrierung oder Beacon-Ausfall *anschaulich* zu machen. Jeder erzeugte
> Lauf trägt deshalb `origin: "synthetic"`, `provenance.format: "synthetic"`, die vollständige Generator-Konfiguration
> und „SYNTHETISCH“ im Namen. Die Herkunft wird bis in Tabellen, Diagramme und Bericht durchgereicht.

Implementierung: `src/data/synthetic.ts` (Generator), `src/data/layout.ts` (fiktiver Demo-Markt).

## 1. Modell

Pro Messwert (Beacon *b*, Zeit *t*, Position *p(t)*):

```
d      = |p(t) − pos_b| · metersPerUnit                      (Meter; Maßstab der Kampagne, hier 1 m/LE, unbestätigt)
RSSI   = trueRssiAt1m − 10 · n · log10(max(d, 0.1))
         + bias_b                       statischer Bias je Beacon  ~ N(0, beaconBiasStdDb)
         + szenarioabhängiger Bias(p, t)   (Mehrwege-Feld, Umschalt-Bias)
         + N(0, shadowingStdDb)         Schattierung/Rauschen je Messwert
         + Ausreißer-Spike              (nur Szenario „multipath“)
```

* Ganzzahl-Quantisierung wie bei iOS (`Math.round`), Begrenzung auf **[−105, −30] dBm**.
* **Empfängerempfindlichkeit** (`sensitivityDbm`, Standard −100 dBm): schwächere Signale werden gar nicht empfangen
  (kein Messwert) – das erzeugt natürliche Lücken weit vom Beacon entfernt. Abgeschnittene Verteilungen führen dazu, dass
  die *beobachtete* Streuung schwacher Verbindungen kleiner ist als σ.
* **Paketverlust**: jeder Messwert fällt mit Wahrscheinlichkeit `packetLossProb` aus.
* **Senderate**: `sampleRateHz` pro Beacon; jeder Beacon hat eine feste, aus dem Seed gezogene Phase (keine
  gemeinsamen Zeitpunkte wie bei iOS-Ranging, sondern leicht versetzte).
* Zeitstempel sind **relative Sekunden** ab Laufbeginn (auf Millisekunden gerundet).

## 2. Reproduzierbarkeit

* Einzige Zufallsquelle: `mulberry32(seed)` (+ Box‑Muller); keine Uhrzeit, kein `Math.random`.
* Gleiche Konfiguration + gleiche Kampagne ⇒ **byte-identische** Ausgabe (Test: `JSON.stringify`-Gleichheit).
* `createdAt`/`importedAt` sind die feste Zeichenkette `2026-01-01T00:00:00.000Z`; die Lauf-ID ist
  `run-syn-<szenario>-<seed>-<rolle>-<fnv1a(Kampagnen-ID + Konfiguration)>`.
* `provenance.synthetic` enthält die vollständige Konfiguration; `provenance.sha256` ist der **SHA‑256 der kanonischen
  Konfiguration** (`stableStringify`), nicht einer Datei. Zum Reproduzieren genügt `generateSyntheticRun(campaign, cfg, role)`.
* Standard-Seeds: good-coverage 1001, poor-coverage 1002, high-noise 1003, beacon-dropout 1004, aisle-walk 1005,
  jumping-between-beacons 1006, miscalibrated 1007, multipath 1008. Die Demo-Kampagne verwendet 101, 102 (Kalibrierung) und 201–204 (Auswertung).

## 3. Fiktiver Demo-Markt

„Fiktiver Demo-Markt (synthetisch)“, 30 × 20 Layout-Einheiten, `origin: "synthetic"`, Maßstab unbestätigt (1 m/LE als
Konvention, `confirmed = false`): Eingang unten links, vier Kassen daneben, dünne Außenwände, Kühlregal an der
Rückwand, fünf lange parallele Regalreihen (Gänge ≥ 2 Einheiten), Seitenkorridore links/rechts. Zehn Beacons
`LAB-B01` … `LAB-B10` an Regalenden, Kühlregal und Wänden. Alle Haltepunkte und Laufrouten liegen auf freien
Gangmitten (per Test geprüft). Er ist erfunden und bildet keinen echten Markt ab.

## 4. Gemeinsame Parameter (`SyntheticScenarioConfig`)

| Feld | Bedeutung |
|---|---|
| `seed` | Startwert des Zufallsgenerators |
| `trueRssiAt1m`, `truePathLossExponent` | **wahres** Modell der Simulation (Standard −70 dBm, n = 2,6). Das Lab-Standardmodell (−72 dBm, n = 2,8) kennt es nicht. |
| `shadowingStdDb` | σ des Rauschens (dB) |
| `sampleRateHz` | Senderate je Beacon |
| `packetLossProb` | Paketverlustwahrscheinlichkeit |
| `extra.beaconBiasStdDb` | σ des statischen Bias je Beacon (Standard 1,5 dB) |
| `extra.sensitivityDbm` | Empfängerempfindlichkeit (Standard −100 dBm) |
| `extra.activeBeaconIds` | Komma-Liste; nur diese Beacons senden (sonst alle aktivierten der Kampagne) |

**Stationäre Szenarien** (`extra`): `holdSec` (40 s je Punkt), `transitSec` (5 s ohne Aufzeichnung zwischen den Punkten),
`pointCount` (5), `pointSet` (`"eval"` = 8 Auswertungspunkte, `"cal"` = 8 andere Kalibrierungspunkte – Kalibrier- und
Auswertungspunkte sind absichtlich verschieden). Die Punkte liegen in Gangmitten. **Referenzen** wie im Protokoll der
iOS-App: pro Haltepunkt **zwei** Truth-Punkte (Anfang und Ende der Haltephase, gleiche Position, Label `P1`, `P2`, …).
Die Auswertung behandelt gleiche aufeinanderfolgende Truth-Punkte als stationäre Haltephase.

**Geh-Szenarien** (`extra`): `speedMps` (Gehgeschwindigkeit), `refIntervalSec` (Referenz jede Sekunde entlang des Pfades).

## 5. Szenarien

| ID | Art | Wichtigste Parameter | Zweck / zu erwartender Effekt |
|---|---|---|---|
| `good-coverage` | stationär | σ = 3 dB, 2 Hz, Verlust 5 %, alle 10 Beacons | Referenzfall |
| `poor-coverage` | stationär | σ = 5 dB, **1 Hz**, **Verlust 55 %**, `activeBeaconIds = LAB-B01,LAB-B07,LAB-B09` (weit auseinander) | oft < 3 Beacons pro Epoche → Fehlschläge, große Lücken |
| `high-noise` | stationär | **σ = 8 dB**, Verlust 10 % | RSSI-Filter wirken deutlich |
| `beacon-dropout` | stationär | `dropoutBeaconId = LAB-B08`, `dropoutStart = 60 s`, `dropoutEnd = 150 s` | Beacon schweigt im Intervall; Robustheit gegen fehlende Beacons |
| `aisle-walk` | Gehen | `speedMps = 1.1`, Referenz alle 1 s; Route: linker Korridor hoch von (1,6; 17,5) nach (1,6; 8,5), Gang y = 8,5 nach Osten, rechter Korridor, Gang y = 5,5 nach Westen (ca. 61 LE, ≈ 55 s) | Verzögerung (Lag), Glättung, zeitlicher Filter |
| `jumping-between-beacons` | Gehen | nur `LAB-B03` und `LAB-B04` aktiv, wahres Modell −66 dBm / n = 2,4, σ = 2 dB, `speedMps = 0.4`, hin und her zwischen x = 12 und 18 im Gang y = 8,5, 60 s; `toggleBiasDb = 9`, `togglePeriodSec = 4`: Bias von A und B kippt alle 4 s mit entgegengesetztem Vorzeichen | Schätzung „springt“ zwischen den Beacons → Sprungrate, zeitliche Filter |
| `miscalibrated` | stationär | **wahr: −62 dBm, n = 2,0** (Lab-Standardmodell: −72/2,8), σ = 3 dB | Distanzen werden mit Standardmodell falsch geschätzt → Distanzen und damit Trilateration verzerrt; eine Kalibrierung auf den Kalibrierungsläufen sollte das beheben |
| `multipath` | Gehen | Route wie `aisle-walk`, σ = 2 dB; `multipathAmplitudeDb = 5`, `multipathWavelengthUnits = 6`, `spikeProb = 0.03`, `spikeDb = 18` | pro Beacon ein glattes ortsabhängiges Bias-Feld (Summe dreier Sinusanteile mit zufälliger Richtung, Wellenlänge 0,7–1,3 × Parameter, Std ≈ Amplitude) plus gelegentliche Spikes (±18 dB × 0,6–1,0) |

Die Lab-Standardwerte der Läufe sind in `defaultScenarioConfig(id, seed?)` festgelegt; jede Konfiguration lässt sich vor
dem Erzeugen ändern (die Änderung steht dann in `provenance.synthetic`).

## 6. Demo-Kampagne

`createDemoCampaign()` – „Demo-Kampagne (SYNTHETISCH)“ auf dem fiktiven Demo-Markt, Lab-Standardpfadverlust (unkalibriert),
Datum ist der feste Platzhalter 2026‑01‑01:

| Lauf | Rolle | Szenario | Seed |
|---|---|---|---|
| Kalibrierung A | calibration | good-coverage, 8 Kalibrierpunkte à 30 s | 101 |
| Kalibrierung B | calibration | good-coverage, 8 Kalibrierpunkte à 30 s | 102 |
| Auswertung – Gute Abdeckung | evaluation | good-coverage | 201 |
| Auswertung – Starkes Rauschen | evaluation | high-noise | 202 |
| Auswertung – Beacon-Ausfall | evaluation | beacon-dropout | 203 |
| Auswertung – Gang-Lauf | evaluation | aisle-walk | 204 |

Die Erzeugung dauert wenige Millisekunden (Test: < 300 ms).

## 7. Grenzen des Modells

Kein echtes Mehrwege- und Körperabschattungsmodell, keine Wände als Dämpfung (Sichtverbindung wird nie blockiert),
keine zeitliche Korrelation der Schwankung, keine Geräte-Unterschiede, keine Ausrichtung der Antenne. Rauschen ist
unkorreliert und normalverteilt – reale Messungen sind das nicht. Ergebnisse auf synthetischen Daten sagen daher nur,
ob die **Auswertungskette** korrekt rechnet, nie, wie gut Indooro in einem Markt funktioniert.
