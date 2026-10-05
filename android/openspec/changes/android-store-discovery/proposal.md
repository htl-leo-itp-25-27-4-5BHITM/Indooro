## Why

Indooro besitzt bereits die fachliche iOS-Referenz für **Filialübersicht, manuelle Auswahl und Beacon-Erkennung**, aber keine native Android-Umsetzung. Dieser Change plant den nachvollziehbaren Android-Vertrag für P12–P18, einschließlich Fehlerkorrekturen statt Übernahme bekannter Swift-Bugs.

## What Changes

- Plant Filialübersicht, manuelle Auswahl und Beacon-Erkennung mit beobachtbaren positiven und negativen Szenarien.
- Trennt statisch belegtes iOS-Verhalten von Android-Entscheidungen; siehe [Paritätsmatrix](../../../PARITY_MATRIX.md).
- Führt die im Design beschriebenen nativen Komponenten und Tests ein; ausschließlich spätere Implementierungsarbeit.
- Hält die Voraussetzungen verbindlich: A01, A02; R-DA für exakte Beacon-Zuordnung. D04 Kartenanbieter vor Outdoor-Kartenintegration.
- Die Planung ändert keine laufende API, keinen Root-Vertrag und keinen Produktionscode.

## Capabilities

### New Capabilities

- `android-store-discovery`: Filialübersicht, manuelle Auswahl und Beacon-Erkennung.

### Modified Capabilities

Keine. Backend-Requirements verbleiben in Root; Android ergänzt nur Consumer-Verhalten.

## Impact

Android-Owner **A03**; geplante Module und Einzeldateien stehen in design.md/tasks.md. Gemeinsame Referenzen: mobile-store-detection, ios-store-map-experience; Einstieg über [Root-Specs](../../../../openspec/specs/). Quellen: aktive Final-Swift-App, [Bestandsaufnahme](../../../DISCOVERY.md), [API-Vertragsinventar](../../../API_CONTRACT.md), Root-RUNBOOK und Audits. [Root-Gates](../../../DEPENDENCIES.md) werden nicht als implementiert angenommen.

Anonyme Mobile-/Katalog-Lesezugriffe bleiben anonym. Admin-Keycloak, Rollen und geschützte Admin-/Maintenance-Routen bleiben unverändert und werden nicht im Androidclient angeboten. Keine Deployments in diesem Planungsauftrag. Abnahme: sämtliche Delta-Szenarien, zugeordnete T-P-Fälle und change-spezifische Verifikationsaufgaben müssen nach Implementierung nachgewiesen sein.
