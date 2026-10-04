## Why

Indooro besitzt bereits die fachliche iOS-Referenz für **Optionale AR-Routenvorschau mit belastbarer Ausrichtung**, aber keine native Android-Umsetzung. Dieser Change plant den nachvollziehbaren Android-Vertrag für P48–P51, einschließlich Fehlerkorrekturen statt Übernahme bekannter Swift-Bugs.

## What Changes

- Plant Optionale AR-Routenvorschau mit belastbarer Ausrichtung mit beobachtbaren positiven und negativen Szenarien.
- Trennt statisch belegtes iOS-Verhalten von Android-Entscheidungen; siehe [Paritätsmatrix](../../../PARITY_MATRIX.md).
- Führt die im Design beschriebenen nativen Komponenten und Tests ein; ausschließlich spätere Implementierungsarbeit.
- Hält die Voraussetzungen verbindlich: A01, A05, A06; ARCore-fähige reale Geräte; D05 Ausrichtung, D06 Feldmessung.
- Die Planung ändert keine laufende API, keinen Root-Vertrag und keinen Produktionscode.

## Capabilities

### New Capabilities

- `android-ar-guidance`: Optionale AR-Routenvorschau mit belastbarer Ausrichtung.

### Modified Capabilities

Keine. Backend-Requirements verbleiben in Root; Android ergänzt nur Consumer-Verhalten.

## Impact

Android-Owner **A08**; geplante Module und Einzeldateien stehen in design.md/tasks.md. Gemeinsame Referenzen: mobile-ar-navigation; Einstieg über [Root-Specs](../../../../openspec/specs/). Quellen: aktive Final-Swift-App, [Bestandsaufnahme](../../../DISCOVERY.md), [API-Vertragsinventar](../../../API_CONTRACT.md), Root-RUNBOOK und Audits. [Root-Gates](../../../DEPENDENCIES.md) werden nicht als implementiert angenommen.

Anonyme Mobile-/Katalog-Lesezugriffe bleiben anonym. Admin-Keycloak, Rollen und geschützte Admin-/Maintenance-Routen bleiben unverändert und werden nicht im Androidclient angeboten. Keine Deployments in diesem Planungsauftrag. Abnahme: sämtliche Delta-Szenarien, zugeordnete T-P-Fälle und change-spezifische Verifikationsaufgaben müssen nach Implementierung nachgewiesen sein.
