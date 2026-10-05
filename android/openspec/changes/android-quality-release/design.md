## Context

**A12 – Berechtigungen, Datenschutz, Accessibility, CI und Release-Abnahme**. Im Code verifizierte Beobachtungen: [Matrix P58–P60, P71–P74; alle P-IDs als Abschlussgate](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: swift-client, shared-api, deployment-operations. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

Querschnitt beginnt nach A01 parallel; finale Freigabe erst A02–A11 und die in DEPENDENCIES.md genannten Root-/Entscheidungsgates.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

PermissionCoordinator als Capabilityzustände, keine globale Startblockade. API26–30: BLUETOOTH/ADMIN (maxSdk30), Location für Scans; API31+: SCAN und Fine Location, Coarse+Fine gemeinsam anfragen für Präzisionswahl. Kein neverForLocation, da ausdrücklich Indoor-Position abgeleitet wird und das Flag Beacons filtern kann. CONNECT nur für tatsächlich genutzte geschützte Adapterzustands-/Enable-Aufrufe, kein ADVERTISE. Kamera erst A08. Internet normal. Keine Hintergrundstandort-, Benachrichtigungs-, Medien-/Storage- oder Activity-Recognition-Permission. Grobe Standortfreigabe/abgelehnt/permanent denied/one-time/revoked getrennt, manuelle Funktionen bleiben.

Foreground-only: BLE/Pose laufen nur bei sichtbarer App und aktivierter Erkennung/Navigation, Kamera nur sichtbares AR. Kein Foreground Service und kein WorkManager-Livescan. Bildschirm aus/app hidden pausiert Führung; Rückkehr zeigt Warmup. Automatische Backups und Device Transfer für Listen, PendingTransfers, Standortcaches und Diagnosen ausschließen, Export bewusst. Keinerlei Analytics-SDK; Backend-Upsell sendet nur katalogbezogene notwendige Felder. Datenschutztext beschreibt Beaconlookup und optionalen Karten-/AR-Anbieter ohne falsches Offlineversprechen.

TalkBack, Switch Access, Touchziele >=48dp, 200%-Schrift, Kontrast, Fokusreihenfolge, Zustandsansagen und alternative Stopp-/Regalliste sind verbindlich. Nichtfarbliche Low-confidence/Fehlerzustände und reduzierte Bewegung. Tablet/Foldable/Fenstergrößenwechsel, Edge-to-edge/IME und Predictive Back prüfen.

CI künftig eigener Android-Workflow: lockfile/Gradle verification, unit/lint/Room migrations/Compose managed devices/Mock API/Release assemble, OpenSpec aus beiden cwd getrennt. Keine aktuellen Workflows in diesem Auftrag ändern. Signiertes AAB nur mit CI-Secret-/Signingverwaltung, eindeutiger applicationId und steigendem versionCode, R8/Resource-Shrink-Smoke, Mappingfile sichern, Play-Testtrack vor späterem Rollout. Play-Target-/Datensicherheitsregeln unmittelbar vor Release erneut prüfen, keine heute behauptete Freigabe. Reale BLE/AR-Tests bleiben zusätzlich nötig.

Offizielle Plattformbelege: [RESEARCH S06–S07, S13–S18](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| Punktuelle Rechte, Vordergrundbetrieb und echte Gerätegates | Alle Rechte beim Start, Dauerservice oder ausschließlich Emulatorabnahme | Manuelle Kernfunktionen bleiben nutzbar; echte Funk-/AR-Qualität lässt sich nicht aus Simulation ableiten. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `app/src/main/AndroidManifest.xml`
- `app/src/main/res/xml/data_extraction_rules.xml`
- `app/src/main/res/xml/backup_rules.xml`
- `app/.../PermissionCoordinator.kt`
- `core/testing/.../DeviceScenarioHarness.kt`
- `app/src/androidTest/.../ParityJourneyTest.kt`
- `../.github/workflows/android.yaml`

## Risks / Trade-offs

Emulatoren beweisen kein Funkverhalten. Berechtigungs-/OEM-Abweichungen, System-Back und API36-Large-screen-Verhalten können nur über Gerätematrix abgenommen werden. R-SH/SC-Sicherheits- und Vertragsfreigaben sind Releasegates.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- Permissions follow capability and OS version: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Background transitions stop active sensing: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Local and transmitted data are minimized: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- All primary flows are accessible: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Automated evidence is isolated and reproducible: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Release requires physical parity evidence: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Keine Veröffentlichung in diesem Auftrag. Später Pilot→intern→gestaffelt; Stop des Rollouts bei Datenverlust/Fehlrouting, AR/BLE/Upsell getrennt abschaltbar. Android-VersionCode erlaubt keinen simplen Downgrade; Forward-fix mit kompatibler DB statt Restore durch Neuinstallation.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

D01/D02 Toolchain/App-ID, D04 Provider, D06 Feldgrenzen, D08 Dismissal-Scope und verbleibende Root-Releasegates.
