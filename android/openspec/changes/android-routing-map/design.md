## Context

**A06 – Begehbarer Graph, Routenstabilität und Indoor-Kartenbedienung**. Im Code verifizierte Beobachtungen: [Matrix P34–P39](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: mobile-positioning-navigation, ios-store-map-experience, store-layout-management. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

A01, A04; A05 Pose-Interface, Integration nach A05. D05 begrenzt Regalzugangsseite und Heading.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

IndoorGraph mit 1-m-Raster, orthogonalen Kanten und heap-basiertem A*, Graphcache pro Store/Layoutrevision. Port des aktiven IndoorGraph/RouteManager, nicht des ungenutzten Pathfinder.swift. Rotation wird bei Hindernisbelegung und Segmentkollision berücksichtigt; unbekannte Elemente konservativ blockieren. Polygonmodell in Metern ist gemeinsame Grundlage für Canvas, Hit-Tests und Routing. Begehbare Typen nach Layoutvertrag explizit, nicht aus Farbe geraten.

Produktziel ist ein erreichbarer freier Zugangsknoten am aufgelösten Regal, nicht das blockierte Regalzentrum. Ohne definierte accessAngle-Semantik kürzester erreichbarer benachbarter Zugang mit Kennzeichnung Regalnähe; keine Behauptung richtiger Regal-/Gangseite. Bei keinem Zugang: nicht erreichbar. D05 muss Semantik, Nordrichtung und Walkability der Elementtypen mit Root-Layoutteam festhalten. Keine wörtliche Übernahme des iOS-Wandquerungs-/Präfixfehlers.

RouteManager übernimmt 8 m/6 s Offroute-Evidenz, 20 s Cooldown, 5 m Mindestpositionsänderung, 6 m Routendifferenz, Segmentlock 2,4 m, Unlock 2,6 m, Backtrack 3 m als Startprofil. Low confidence sperrt Reroute. Für kleine Läden sind diese Werte eventuell zu großzügig: D06 misst, Profiländerungen erhalten eigene Fixtures.

Compose Canvas mit geteiltem Viewport-Transform, Zoom 0,65–2,5, Pan, Fit, Zielkarte, Stopps und Benutzerposition; native Liste als zugängliche Alternative zur Karte. Keine geglättete Linie durch Hindernisse, keine Luftlinie als erfolgreiche Route. Produktfokus beendet Tour wie iOS; Karte zeigt dann Einzelziel und Einplanen. Zurück zur Übersicht löscht Einzelziel, keine lokalen Listendaten. Debug-Position und Beaconmarker nur demo/debug; Position setzen ist produktiv erreichbar.

Offizielle Plattformbelege: [RESEARCH S01, S13–S14](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| Rotationsbewusster Rastergraph und Heap-A-Star | Navmesh/Navigation-SDK oder direkte Linien | Raster erhält die vorhandene 1-m-Layoutlogik und testbare Parität; Navmesh wäre ein eigener Modellwechsel, Direktlinien verletzen Hindernisse. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `domain/navigation/.../LayoutGeometry.kt`
- `domain/navigation/.../IndoorGraph.kt`
- `domain/navigation/.../AStar.kt`
- `domain/navigation/.../MapMatcher.kt`
- `domain/navigation/.../RouteManager.kt`
- `feature/map/.../MapViewport.kt`
- `feature/map/.../MapScreen.kt`

## Risks / Trade-offs

1-m-Raster kann schmale Korridore schließen. Ohne accessAngle lässt sich korrekte Regalseite nicht beweisen. Bei widersprüchlichen Geometriedaten lieber Nicht erreichbar als Wanddurchquerung; D05 ist Gate für exakte Regalseitenparität.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- Routes remain inside walkable geometry: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Shelf approach is explicit: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Offroute rerouting uses sustained evidence: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Map interaction shares one coordinate transform: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Map exposes complete target and tour controls: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Routing computation is reusable and bounded: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Graphen sind abgeleitet und können verworfen werden. Layoutrevision invalidiert Route/Stop-Zuordnung; Zielprodukt bleibt als Absicht erhalten und wird neu aufgelöst. Bei Rollback altes Algorithmusprofil nur mit weiterhin validen Geometrietests freigeben.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

D05: Zugangswinkel, Nordrotation und Element-Walkability; D06 Tuning für kleine Läden.
