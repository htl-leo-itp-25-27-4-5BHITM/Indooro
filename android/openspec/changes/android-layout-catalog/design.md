## Context

**A04 – Layoutdaten, Produktsuche und Regalzuordnung**. Im Code verifizierte Beobachtungen: [Matrix P19–P27](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: store-layout-management, product-catalog-search, ios-product-planning. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

A01–A03; R-B ist Referenz für Fehlerkorrekturen, kein Warten auf Swift-Code. D03 blockiert vollständige filialbezogene Kategorienabnahme.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

LayoutRepository hält einen atomaren Snapshot aus Store-ID, Layout-ID, Quelle, fallback, geladenAm und Revision. Server→Cache derselben Filiale→explizites Demo-Bundle; ein Default-/Bundle-Layout wird niemals als echte Filialgeometrie für Live-Navigation verwendet. Das weicht bewusst vom unsicheren Root-B-Fallback ab: Demo bleibt anschaubar, Navigation verlangt verifizierte Filialzuordnung. Historische globale Layouts und LayoutSelectionSheet sind nicht erreichbar in der aktiven iOS-App; Android bietet sie nur in Diagnose/Demo, keine neue Kundenversionswahl.

Layoutdecoder bewahrt Koordinaten, Dimensionen, Rotation, accessAngle, locked und Beacon-Aliase. Rotation wird mit dem Rendering-/Routing-Geometriemodell geteilt. Produktposition nutzt exakte Kategorie-Segmentgleichheit und effectiveMeter, nicht startsWith. Fach/Slot bleiben Informationen, da der aktuelle Code keine belastbare Fachgeometrie herleitet. Mehrdeutige Regalzuordnung heißt ungeklärt, nicht erstes Regal.

Planning-Suche ab drei Zeichen, 300 ms Debounce (Android-Verbesserung), size 80; Karten-Suche size 50. Ergebnisse deutsch sortiert, Preis/Position unbekannt getrennt, Einplanen/Navigieren unabhängig aktiviert. Kategorien erhalten alle 13 iOS-Kürzel aus der Matrix; Namensfilter Bio/Demeter sind ausdrücklich Textfilter, keine Zertifizierungsnachweise. Statische Chips heißen Vorschläge statt Kunden kauften.

Wesentlicher Backend-Gate D03: GET /products?size=500 ist global und unvollständig; zusätzliche storeId-Parameter wären wirkungslos. Für finale Parität braucht Root einen überprüften store-scoped Kategorie-/Paging-Vertrag. Bis dahin nur klar bezeichnete globale Katalogvorschau ohne Filialverfügbarkeitsversprechen, nie automatisch als aktive Store-Produkte routen. Für Freitext aktuell nur storeId senden, weil der Server storeId und storeCode mit AND kombiniert; Mapping bleibt gemäß eigenem Vertrag. Eine Änderung am gemeinsamen Vertrag gehört in einen Root-Change.

Offizielle Plattformbelege: [RESEARCH S03, S05](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| Storegebundener Cache mit Provenienz | Beliebiges letztes/globales Layout als Storefallback | Die alternative Fallbackkette würde Funktion vortäuschen und kann räumlich falsche Ziele liefern. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `feature/planning/.../PlanningViewModel.kt`
- `feature/planning/.../PlanningScreen.kt`
- `core/model/.../LayoutSnapshot.kt`
- `core/network/.../LayoutRepository.kt`
- `core/network/.../ProductRepository.kt`
- `domain/navigation/.../ProductLocationResolver.kt`
- `core/database/.../LayoutCacheDao.kt`

## Risks / Trade-offs

Gültiger Cache kann räumlich veraltet sein; immer Datum zeigen, nach Layoutwechsel alle Ziele neu auflösen. Default-Layout ist kein beweisbares Storelayout. D03 ohne Backendentscheidung lässt Kategorienabnahme blockiert.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- Layout provenance remains visible: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Layout decoding preserves spatial meaning: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Search has explicit thresholds and errors: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Category browsing is honest about contract limits: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Product location resolution never guesses: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Planning actions reflect local list state: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Cache formatVersion 1, Schema-/Environment-/Store-Schlüssel; invaliden Cache isolieren, nicht Listen vernichten. Alte gültige Revision bis vollständig validierter neuer Snapshot bereitsteht behalten. Rollback kann nur Cache löschen, nie Room-Listen.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

D03 Kategorie-Paging/Filial-Scope; D05 accessAngle und Layout-Nordrichtung bleiben für A06/A08 offen.
