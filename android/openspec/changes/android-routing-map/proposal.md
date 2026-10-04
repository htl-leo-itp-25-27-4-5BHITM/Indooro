## Why

Indooro besitzt bereits die fachliche iOS-Referenz für **Begehbarer Graph, Routenstabilität und Indoor-Kartenbedienung**, aber keine native Android-Umsetzung. Dieser Change plant den nachvollziehbaren Android-Vertrag für P34–P39, einschließlich Fehlerkorrekturen statt Übernahme bekannter Swift-Bugs.

## What Changes

- Plant Begehbarer Graph, Routenstabilität und Indoor-Kartenbedienung mit beobachtbaren positiven und negativen Szenarien.
- Trennt statisch belegtes iOS-Verhalten von Android-Entscheidungen; siehe [Paritätsmatrix](../../../PARITY_MATRIX.md).
- Führt die im Design beschriebenen nativen Komponenten und Tests ein; ausschließlich spätere Implementierungsarbeit.
- Hält die Voraussetzungen verbindlich: A01, A04; A05 Pose-Interface, Integration nach A05. D05 begrenzt Regalzugangsseite und Heading.
- Die Planung ändert keine laufende API, keinen Root-Vertrag und keinen Produktionscode.

## Capabilities

### New Capabilities

- `android-routing-map`: Begehbarer Graph, Routenstabilität und Indoor-Kartenbedienung.

### Modified Capabilities

Keine. Backend-Requirements verbleiben in Root; Android ergänzt nur Consumer-Verhalten.

## Impact

Android-Owner **A06**; geplante Module und Einzeldateien stehen in design.md/tasks.md. Gemeinsame Referenzen: mobile-positioning-navigation, ios-store-map-experience, store-layout-management; Einstieg über [Root-Specs](../../../../openspec/specs/). Quellen: aktive Final-Swift-App, [Bestandsaufnahme](../../../DISCOVERY.md), [API-Vertragsinventar](../../../API_CONTRACT.md), Root-RUNBOOK und Audits. [Root-Gates](../../../DEPENDENCIES.md) werden nicht als implementiert angenommen.

Anonyme Mobile-/Katalog-Lesezugriffe bleiben anonym. Admin-Keycloak, Rollen und geschützte Admin-/Maintenance-Routen bleiben unverändert und werden nicht im Androidclient angeboten. Keine Deployments in diesem Planungsauftrag. Abnahme: sämtliche Delta-Szenarien, zugeordnete T-P-Fälle und change-spezifische Verifikationsaufgaben müssen nach Implementierung nachgewiesen sein.
