## Context

**A02 – API-Vertrag, Modelle und verlässliches Networking**. Im Code verifizierte Beobachtungen: [Matrix P06–P11](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: shared-api, ios-backend-integration, domain-model. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

A01; R-SC für versionierten Produktionsvertrag. Legacy-Leseadapter mit lokalen Fixtures sofort möglich.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

Ein einziges APIEnvironment und OkHttp/Retrofit mit Kotlin-Serialization-DTOs, Suspend-Funktionen und Repository-Mapping. Alternative Ktor ist technisch geeignet, bringt hier ohne Multiplattformziel keinen Vorteil; direkte HttpURLConnection würde Fehler-/Cancellation-Boilerplate verteilen. Bibliotheksversionen erst in D01 sperren.

Handgeschriebene schmale DTOs zunächst gegen Root-OpenAPI und Java-DTOs testen; Generator erst nach R-SC als Types-only-Option prüfen. Free-form Layout bleibt expliziter toleranter Decoder. Kein zweites Android-openapi.yaml. R-SC muss den Export-Consumer android ergänzen, da der geplante Export bisher ios filtert.

Legacy /api und künftiges /api/v1 sind explizite Build-/Deployment-Profile; kein stilles Prefix-Fallback und kein Doppel-POST. RequestKey enthält Environment, storeId, generation, Query/Entity-ID. Cancellation plus Response-Generation verhindern stale commits. UUID/String-IDs strikt, Produkt-ID Int32 nach Backend, Preise nullable Decimal-Domain aus JSON number; kein Null→0. Uhrzeiten als Instant mit optionalen Bruchteilen. Fehler werden nach HTTP-Status entschieden; öffentliche App erhält bei 401/403 keine Admin-Login-Oberfläche.

Lesen: 10 s Connect, 15 s Gesamtabruf als initiale Android-Budgets; maximal ein Retry für idempotentes GET bei Transport/502/503/504, nur aktueller Kontext. POST plan: 25 s gesamt, kein generischer Retry. Events/dismiss: 3 s, best effort, keine persistente Warteschlange. A10 besitzt einzigen fachlich begründeten Pre-AI-Retry. 429 respektiert Retry-After ohne automatischen Upsell-Retry.

Offizielle Plattformbelege: [RESEARCH S01, S15](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| Schmale DTOs plus geprüfter Root-Vertrag | Ungeprüfter Vollclient-Codegen oder freie JSON-Maps | Codegen wartet auf R-SC; explizite Mapper erhalten Nullability und layout-spezifische Toleranz. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `core/network/.../APIEnvironment.kt`
- `core/network/.../IndooroApi.kt`
- `core/network/.../ApiResult.kt`
- `core/network/.../RequestKey.kt`
- `core/network/.../dto/`
- `core/model/.../mappers/`
- `core/network/src/test/.../ContractTest.kt`

## Risks / Trade-offs

R-SC ist geplant, nicht verfügbar. Nullable Backend-Produkte widersprechen Swift-Zwangsfeldern. Toleranz darf Schemakorruption nicht als Erfolg verschleiern; fehlerhafte IDs verwerfen und sichtbare Teilfehler zählen.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- Shared contract is consumed without copying ownership: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Models tolerate optional data without fabricating values: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Latest context wins: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Errors and emptiness are distinct: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Retries are bounded and method aware: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Network evidence excludes private content: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Keine Servermigration durch Android. Adapterprofil per App-Version wechseln; alte Server noch explizit in dev testbar. Bei Vertragsinkompatibilität Funktion kontrolliert deaktivieren statt Writes auf Legacy zu wiederholen. Cache-Keys enthalten Environment und Contract-Version.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

R-SC Export erweitert android; D03 umfasst verbindlichen Produkt-Scope, Nullability und Kategorienvertrag.
