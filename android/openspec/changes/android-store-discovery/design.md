## Context

**A03 – Filialübersicht, manuelle Auswahl und Beacon-Erkennung**. Im Code verifizierte Beobachtungen: [Matrix P12–P18](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: mobile-store-detection, ios-store-map-experience. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

A01, A02; R-DA für exakte Beacon-Zuordnung. D04 Kartenanbieter vor Outdoor-Kartenintegration.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

StoreRepository und StoreContext trennen erkannte Filiale, manuell gewählte Filiale und erfolgreich geladenes Layout. Manuelle Auswahl hat Vorrang bis explizit Automatik aktiviert wird; automatische Erkennung wechselt eine laufende Tour nicht still, sondern bietet einen bestätigbaren Filialwechsel. Das ist eine bewusste Korrektur des direkten iOS-Wechsels. 404/409 lassen die gültige manuelle Auswahl erhalten.

Android BluetoothLeScanner liest iBeacon manufacturer data (companyId 0x004C; Android-Bytearray beginnt danach mit 0x02,0x15, dann 16 UUID-Bytes, big-endian Major/Minor und signed TxPower). iOS manufacturerData enthält die Company-ID dagegen bereits. Kein CoreLocation-accuracy-Äquivalent: A05 schätzt Distanz. AltBeacon wäre ein möglicher Adapter mit Lifecycle-Hilfe, wird zunächst zugunsten des kleinen testbaren nativen Parsers verworfen. Kein Pairing, keine GATT-Verbindung, keine MAC-basierte Identität, kein Name-/Suffix-Fallback in Produktion.

Lookup bei gültigem RSSI >= -95 dBm, dedupliziert nach kompletter Identität statt nur UUID; Fehler-Cooldown 15 s je Identität. Kataloginitialisierung und spätestens alle 60 s bei aktivem Foreground-Scanning; leere gültige Serverliste entfernt widerrufene Identitäten, Transportfehler behält einen als veraltet markierten Snapshot. Scans werden nicht bei jedem Tick neu gestartet. Scan-Fehler erhalten einen sichtbaren Zustand und einen begrenzten Neustart nach 30 s, danach manuelle Wiederholung.

Outdoor-Map über MapProvider-Interface. Empfehlung Google Maps SDK als native MapKit-Entsprechung; Kosten, Anbieterbedingungen, Key-Restriktionen und Geräte ohne Play Services müssen D04 klären. Alternative MapLibre braucht gesonderten Tilevertrag; kein stillschweigender Gratis-Tilebetrieb. Fehlender Provider beeinträchtigt die Filialliste nicht. Pins ausschließlich mit validen echten Koordinaten; Filialen ohne Koordinaten separat auswählbar.

Offizielle Plattformbelege: [RESEARCH S06–S07, S19](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| Nativer Scanadapter, volle Identität und manuelle Priorität | AltBeacon/CDM oder sofortiges Auto-Switch bei jedem Treffer | Öffentliche Beacons brauchen keine Pairingoberfläche; manuelle Priorität verhindert versehentliche Tourwechsel. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `feature/stores/.../StoreViewModel.kt`
- `feature/stores/.../StoreScreen.kt`
- `feature/stores/.../MapProvider.kt`
- `core/model/.../StoreContext.kt`
- `platform/beacons/.../IBeaconAdvertisementParser.kt`
- `platform/beacons/.../BeaconScanner.kt`
- `platform/beacons/.../StoreDetector.kt`

## Risks / Trade-offs

R-DA behebt Backend-Fallback auf falsche Beacon-Identität; bis dahin Match-Identität streng prüfen und ungesicherte Treffer nicht aktivieren. OEM-Scanverhalten und fehlende Play Services benötigen reale Geräte. Outdoor-Anbieter ist eine echte Beschaffungsentscheidung.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- Store overview never fabricates locations: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Store selection is a guarded context transition: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Beacon advertisements are parsed by exact identity: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Detection requests are bounded and revocable: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Unavailable scanning preserves manual use: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Cache nach Environment partitionieren. Letzte manuelle Store-ID in DataStore, Metadaten in Room-Cache; beim Entfernen eines Stores Cache ungültig markieren, Listen nicht löschen. Automatik abschaltbar, manuelle Auswahl bleibt Fallback. Keine Beacon-Provisionierung durch die App.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

D04 Kartenanbieter/Billing und Datenschutzfreigabe. R-DA Deploymentnachweis für Identitätsmatch.
