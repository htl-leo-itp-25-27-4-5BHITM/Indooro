## Context

**A01 – Native App-Shell, Architektur und Designsystem**. Im Code verifizierte Beobachtungen: [Matrix P01–P05, P58–P60](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: ios-client-architecture, swift-client. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

Keine Android-Voraussetzung. Toolchain-Auswahl D01 vor Gradle-Festlegung; keine Root-Code-Abhängigkeit.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

Kotlin, Single Activity, Jetpack Compose Material 3, Navigation 3 mit serialisierbaren Destination-IDs und separatem Backstack je Hauptbereich. SwiftUI-Views dienen der Funktion und Informationshierarchie, nicht der Pixelkopie. Views/XML wurden wegen zusätzlicher Zustandsadapter verworfen; Flutter/React Native wegen nativer Sensor-/AR-Integration und Auftrag verworfen.

UDF: Screen-ViewModels veröffentlichen immutable StateFlow, UI sendet Aktionen. Repositories halten fachliche Daten; app-scoped StoreContext mit monotoner generation invalidiert alte Ergebnisse. Hilt für Android-Grenzen, Constructor Injection für reines Kotlin; manueller Container wäre klein, wird bei zwölf Bereichen aber fehleranfälliger. Kein globaler BeaconManager-Port.

Geplante Module: :app, :core:model, :core:network, :core:database, :core:designsystem, :core:testing, :domain:navigation, :domain:shopping, :platform:beacons, :platform:ar sowie :feature:home/planning/stores/map/shopping/recipes/upsell/transfer. Feature-Module hängen von Domain/Core ab, nie voneinander. App orchestriert Übergänge. Startseiten-Karten und Tutorial gehören ausdrücklich dazu.

Baseline minSdk 26, compileSdk/targetSdk 36 als konservativer Planungsentscheid; API 37 zusätzlich qualifizieren, nicht aus einer Preview-Seite als stabile Releasepflicht ableiten. Vor Implementierung aktuelle stabile AGP/Gradle/Kotlin/Compose/Hilt/Room-Kombination und JDK-Kompatibilität in D01 sperren. Keine ungeprüften Versionsnummern in Gradle übernehmen. Light-Palette mit Indooro-Grün und blauem Routenakzent, Android-Systemschrift; System-Dark-Palette als bewusste Verbesserung. Alle Texte deutsche Ressourcen, pluralfähig.

Offizielle Plattformbelege: [RESEARCH S01–S04, S13, S16–S18](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| Compose/Nav3/UDF/Hilt | Views mit Fragments oder manuellem Container | Nativer neuer Compose-Client profitiert von einem einzigen Statepfad; Restore/DI-Kompatibilität wird D01-gated. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `app/src/main/.../MainActivity.kt`
- `app/src/main/.../navigation/IndooroBackStack.kt`
- `feature/home/.../HomeScreen.kt`
- `core/designsystem/.../IndooroTheme.kt`
- `gradle/libs.versions.toml`
- `build-logic/.../AndroidConventionPlugin.kt`

## Risks / Trade-offs

Navigation-3-State-Restoration und DI-Scope müssen am Minimalprototyp geprüft werden; zu viele Module können Buildzeit erhöhen. D01 ist ein kurzer Implementierungsspieß, kein Produktblocker für diese Planung.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- Five primary destinations preserve user intent: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Home and tutorial remain functional: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- State survives recreation with explicit ownership: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Configuration is environment specific: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Native design preserves accessible content: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Neue Android-Installation hat keine iOS-Sandboxdaten. Noch keine Gradle-/App-Dateien vorhanden. Spätere Einführung als separate App; Fundament rücknehmbar ohne Backend. Persistente Schemas nur in A07; App-ID vor erstem signierten Pilot festschreiben.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

D01: konkrete stabile Toolchain beim Implementierungsstart. D02: endgültige applicationId und Signing-Owner vor erstem Pilot.
