## Why

Indooro besitzt bereits die fachliche iOS-Referenz für **Listen, Persistenz und Tour-/Stop-Lebenszyklus**, aber keine native Android-Umsetzung. Dieser Change plant den nachvollziehbaren Android-Vertrag für P40–P47, einschließlich Fehlerkorrekturen statt Übernahme bekannter Swift-Bugs.

## What Changes

- Plant Listen, Persistenz und Tour-/Stop-Lebenszyklus mit beobachtbaren positiven und negativen Szenarien.
- Trennt statisch belegtes iOS-Verhalten von Android-Entscheidungen; siehe [Paritätsmatrix](../../../PARITY_MATRIX.md).
- Führt die im Design beschriebenen nativen Komponenten und Tests ein; ausschließlich spätere Implementierungsarbeit.
- Hält die Voraussetzungen verbindlich: A01, A02; Listen-Domain/Persistenz früh möglich, finale Tourintegration A04/A06. Kein Warten auf iOS-Persistenzmigration R-C.
- Die Planung ändert keine laufende API, keinen Root-Vertrag und keinen Produktionscode.

## Capabilities

### New Capabilities

- `android-shopping-lifecycle`: Listen, Persistenz und Tour-/Stop-Lebenszyklus.

### Modified Capabilities

Keine. Backend-Requirements verbleiben in Root; Android ergänzt nur Consumer-Verhalten.

## Impact

Android-Owner **A07**; geplante Module und Einzeldateien stehen in design.md/tasks.md. Gemeinsame Referenzen: mobile-shopping-lists, ios-product-planning; Einstieg über [Root-Specs](../../../../openspec/specs/). Quellen: aktive Final-Swift-App, [Bestandsaufnahme](../../../DISCOVERY.md), [API-Vertragsinventar](../../../API_CONTRACT.md), Root-RUNBOOK und Audits. [Root-Gates](../../../DEPENDENCIES.md) werden nicht als implementiert angenommen.

Anonyme Mobile-/Katalog-Lesezugriffe bleiben anonym. Admin-Keycloak, Rollen und geschützte Admin-/Maintenance-Routen bleiben unverändert und werden nicht im Androidclient angeboten. Keine Deployments in diesem Planungsauftrag. Abnahme: sämtliche Delta-Szenarien, zugeordnete T-P-Fälle und change-spezifische Verifikationsaufgaben müssen nach Implementierung nachgewiesen sein.
