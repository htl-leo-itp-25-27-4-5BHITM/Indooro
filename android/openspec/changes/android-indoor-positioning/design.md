## Context

**A05 – Sensorpipeline und stabile Indoor-Position**. Im Code verifizierte Beobachtungen: [Matrix P28–P33](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: mobile-positioning-navigation. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

A01, A03, A04. Reale Geräte-/Beacon-Kalibrierung D06; R-B korrigiertes Confidence-Soll übernehmen, nicht auf Swift warten.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

Reine Kotlin-Pipeline in :domain:navigation, Android-Sensoradapter in :platform:beacons. Verarbeitung auf begrenztem Worker-Dispatcher, nicht UI-Thread. Monotone elapsedRealtime-Zeit für Alter, Filter und Hold-Dauer; UTC nur für persistente Zeitstempel. Scanner und Pose-Clock sind unabhängig.

Referenzwerte aus StabilizedNavigationConfig als initiales Profil übernehmen: Tick 0,35 s, warmup 1,2 s, stale 2 s, >=3 Anker, Distanz 0,35–11 m, Pfadverlust 2,8, Default TxPower -72, Kalman 0,02/4,0; Gauss-Newton maximal zehn Iterationen. RSSI-Ausreißer/12er-Fenster und Qualitätsgewichtung bleiben mathematisch vergleichbar. CoreLocation accuracy/proximity existieren nicht auf Android; eigene RSSI-Qualität und gerätespezifische Kalibrierung ersetzen sie, keine behauptete Messgleichheit.

SensorManager Rotation Vector/Linear Acceleration, Heading-Fallback aus Bewegung; keine Schrittzählung, daher keine ACTIVITY_RECOGNITION-Anforderung. Sensor-Koordinaten bei Displayrotation remappen. Magnetometer ist im Regalumfeld unzuverlässig; Heading nur bei bestätigtem Nordbezug/Alignment und Qualität anzeigen. Bei fehlenden Sensoren BLE plus manuelle Kalibrierung.

Vier Zustände tracking/manualCalibration/lowConfidence/reRouting mit 0,35/0,55 Hysterese. Weniger als drei frische Anker verbietet Trusted-Pose unabhängig vom geglätteten alten Konfidenzwert. Low confidence friert automatische Reroutes, zeigt Unsicherheit und Position setzen. Manuelle Position bleibt ausdrücklich manuell, kein vorgetäuschtes Funkvertrauen. Displayfilter 1 s/0,85 m/3 s, maximal 2,5 m/s und drei Sprungbestätigungen als Ausgangsprofil.

Offizielle Plattformbelege: [RESEARCH S06–S08](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| RSSI/Trilateration mit kurzer Fusion und Kalibrierung | Fingerprint-Datenbank, Cloud-Ortung oder nur gewichteter Schwerpunkt | Fingerprinting verlangt einen noch nicht vorhandenen Vermessungs-/Datenvertrag; lokale Pipeline erhält das fachliche iOS-Modell ohne Servertracking. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `domain/navigation/.../NavigationConfig.kt`
- `domain/navigation/.../BeaconPositionSolver.kt`
- `domain/navigation/.../KalmanFilter.kt`
- `domain/navigation/.../PoseFusion.kt`
- `domain/navigation/.../NavigationStateMachine.kt`
- `platform/beacons/.../MotionSensorSource.kt`

## Risks / Trade-offs

Ein-Meter-Ziel ist ein zu messendes Produktziel, keine Gerätezusage. Unterschiedliche Antennen/TxPower können systematischen Bias verursachen; Profile nur aus anonymen kontrollierten Messungen ableiten.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- Only fresh configured anchors establish trust: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Radio filtering has reproducible timing: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Confidence controls presentation and calibration: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Displayed motion suppresses unconfirmed jumps: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Sensor absence and lifecycle are explicit: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Keine Persistenz roher Sensorhistorien. Bei Store-/Layoutwechsel, Suspend oder Profilwechsel Filter invalidieren und Warmup neu starten. Altes validiertes Parameterprofil rollbackbar; keine Datenbankmigration.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

D06 Geräteprofil und akzeptierte Fehlerverteilung im Pilot. D05 Layout-Nordbezug für absolute Richtung.
