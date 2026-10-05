## Why

Indooro besitzt bereits die fachliche iOS-Referenz für **Berechtigungen, Datenschutz, Accessibility, CI und Release-Abnahme**, aber keine native Android-Umsetzung. Dieser Change plant den nachvollziehbaren Android-Vertrag für P58–P60, P71–P74; alle P-IDs als Abschlussgate, einschließlich Fehlerkorrekturen statt Übernahme bekannter Swift-Bugs.

## What Changes

- Plant Berechtigungen, Datenschutz, Accessibility, CI und Release-Abnahme mit beobachtbaren positiven und negativen Szenarien.
- Trennt statisch belegtes iOS-Verhalten von Android-Entscheidungen; siehe [Paritätsmatrix](../../../PARITY_MATRIX.md).
- Führt die im Design beschriebenen nativen Komponenten und Tests ein; ausschließlich spätere Implementierungsarbeit.
- Hält die Voraussetzungen verbindlich: Querschnitt beginnt nach A01 parallel; finale Freigabe erst A02–A11 und die in DEPENDENCIES.md genannten Root-/Entscheidungsgates.
- Die Planung ändert keine laufende API, keinen Root-Vertrag und keinen Produktionscode.

## Capabilities

### New Capabilities

- `android-quality-release`: Berechtigungen, Datenschutz, Accessibility, CI und Release-Abnahme.

### Modified Capabilities

Keine. Backend-Requirements verbleiben in Root; Android ergänzt nur Consumer-Verhalten.

## Impact

Android-Owner **A12**; geplante Module und Einzeldateien stehen in design.md/tasks.md. Gemeinsame Referenzen: swift-client, shared-api, deployment-operations; Einstieg über [Root-Specs](../../../../openspec/specs/). Quellen: aktive Final-Swift-App, [Bestandsaufnahme](../../../DISCOVERY.md), [API-Vertragsinventar](../../../API_CONTRACT.md), Root-RUNBOOK und Audits. [Root-Gates](../../../DEPENDENCIES.md) werden nicht als implementiert angenommen.

Anonyme Mobile-/Katalog-Lesezugriffe bleiben anonym. Admin-Keycloak, Rollen und geschützte Admin-/Maintenance-Routen bleiben unverändert und werden nicht im Androidclient angeboten. Keine Deployments in diesem Planungsauftrag. Abnahme: sämtliche Delta-Szenarien, zugeordnete T-P-Fälle und change-spezifische Verifikationsaufgaben müssen nach Implementierung nachgewiesen sein.
