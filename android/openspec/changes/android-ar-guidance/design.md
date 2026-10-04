## Context

**A08 – Optionale AR-Routenvorschau mit belastbarer Ausrichtung**. Im Code verifizierte Beobachtungen: [Matrix P48–P51](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: mobile-ar-navigation. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

A01, A05, A06; ARCore-fähige reale Geräte; D05 Ausrichtung, D06 Feldmessung.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

ARCore Optional mit Runtime-Supportprüfung, Google Play Services for AR-Installation und Kamera-Berechtigung erst bei AR-Start. Nicht unterstützte Geräte behalten alle 2D-Funktionen. Alternative Kamerabild mit Kompass-Overlay verworfen, weil es räumliches Tracking vortäuschen würde; AR als Pflichtfeature würde unnötig Geräte ausschließen.

ARCore Session und kleiner eigener Renderer auf Surface/AndroidView, keine Abhängigkeit von aufgegebenem Sceneform. Rendererwahl OpenGL ES für einfache Marker; Vulkan als komplexere Alternative ohne aktuellen Bedarf. Meter/Y-up-Transform Map(x,y)→AR(x,z) mit yaw/translation/scale=1. Tests definieren Händigkeit und Vorzeichen explizit.

AR übernimmt unveränderte kollisionsgeprüfte Route, entfernt nur Duplikate, resampelt 0,75 m bzw. 0,45 m bei Kurven. Vorschau endet am nächsten Entscheidungspunkt bzw. 4,5 m und zeigt maximal drei Waypoints; Pool höchstens 120, sichtbarer Bereich 0,25–15 m. AR ist Vorschau, keine zusätzliche Routenquelle.

ARCore allein kennt Layoutursprung und Norden nicht. Vor glaubwürdiger Anzeige bekannte Position plus Ausrichtung bestätigen (Position setzen und entlang bezeichnetem Routensegment ausrichten); plane hit-test für Boden, kein beliebiger unkalibrierter yaw=0. Nach Trackingverlust, Resume oder Storewechsel Alignment ungültig. Kein Cloud Anchor/Geospatial/Video-Upload. UI zeigt Tracking-, Boden-, Alignment- und Funkqualität getrennt; unsichere Marker ausblenden, 2D anbieten.

Offizielle Plattformbelege: [RESEARCH S08–S09](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| ARCore Optional, bestätigtes Alignment und kleiner GL-Renderer | AR Required oder Kompass-Kameraoverlay | Optional erhält Geräteabdeckung; nicht verankerte Kamera-Pfeile würden Genauigkeit nur vorspiegeln. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `platform/ar/.../ArSessionController.kt`
- `platform/ar/.../ArMapTransform.kt`
- `platform/ar/.../PreviewPlanner.kt`
- `platform/ar/.../RouteMarkerRenderer.kt`
- `feature/map/.../ArScreen.kt`

## Risks / Trade-offs

Glänzende Böden, wenig Textur, Lichtwechsel und Kamera-/Play-Services-Verfügbarkeit sind echte Grenzen. iOS forced yaw-Fallback ist kein Soll. Ein gemessener Alignmentnachweis ist Voraussetzung, keine automatische AR-Paritätsbehauptung.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- AR is optional and permission gated: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Alignment requires explicit spatial evidence: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- AR renders the same route with bounded preview: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Tracking loss cannot leave misleading arrows: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Camera lifecycle is local and bounded: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Keine persistierten AR-Weltkarten. Feature pro Build/Runtime abschaltbar mit 2D-Fallback; kein Room-Schemawechsel. Session/GL-Ressourcen auf Stop freigeben und bei Resume neu initialisieren.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

D05 Nord-/Zugangskonvention; D06 akzeptierte Winkeldrift und Positionsabweichung.
