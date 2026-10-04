## Context

**A07 – Listen, Persistenz und Tour-/Stop-Lebenszyklus**. Im Code verifizierte Beobachtungen: [Matrix P40–P47](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: mobile-shopping-lists, ios-product-planning. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

A01, A02; Listen-Domain/Persistenz früh möglich, finale Tourintegration A04/A06. Kein Warten auf iOS-Persistenzmigration R-C.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

Room als transaktionale Single Source of Truth für ListEntity, ItemEntity, SessionEntity und PendingTransferEntity (A11). DataStore nur UI-Einstellungen, keine Liste als JSON-Blob. Alternative JSON-Datei wie geplantes iOS v2 ist portierbar, bietet aber weniger transaktionale Sicherheit für gleichzeitiges Importieren, Rezept-Merge und Check-off. Keine direkte Migration aus iOS UserDefaults oder Zugriff auf andere App-Sandboxen; Übergang ausschließlich über A11 v1-Transfer mit belegten Verlustgrenzen.

Items: UUID, nullable productID/price/layoutCode, quantity>=1, note, sortOrder, open/done/missing/skipped, created/updated, Rezeptmetadaten, addedFromUpsell. Hinzufügen führt offene gleiche productID+layoutCode zusammen; freie Zutaten nur im gleichen Rezept und normalisiertem Namen. Mengen sind Paketzähler, Rezeptmengen separate Text-/Einheitsdaten. Mindestens eine Liste bleibt erhalten. Sortierung und Notizen werden deterministisch gespeichert.

Session enthält sessionGeneration, listID, storeID, routeMode, Zustand running/paused/completed. Start→Store/Geometrie prüfen→Snapshot; Prozessneustart lädt paused, keine Sensorpose; Fortsetzen invalidiert alte Requests. Stop beendet Route/Upsell, lässt Itemstatus bestehen. Alle Stopps erledigt ist nicht automatisch alle freien Artikel erledigt. Snapshot gruppiert offene lokalisierbare Items je shelfID, ordnet Listenfolge oder nearest-neighbor anhand gecachter Distanzen; bei unbekannter Position Listenfolge mit Hinweis. Unreachable getrennt von unresolved.

Stop-Aktion trägt erwartete Snapshotrevision und Stop-ID; Transaktion markiert genau diese Item-IDs, nicht einen zwischenzeitlich wechselnden neuen aktuellen Stopp. Bei veralteter Revision keine Mutation und Hinweis „Tour aktualisiert – erneut bestätigen“. Danach neue Route und Upsell-Ereignis nur aus bestätigter Transaktion. Rebuild bei Listen-/Layout-/Moduswechsel oder >=1 m stabiler Bewegung, nicht jedem Rohsample. Room-Schemaexport und Migrationstests obligatorisch, kein destructive fallback.

Offizielle Plattformbelege: [RESEARCH S03, S05](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| Room-Transaktionen und revisionsgebundene Aktionen | UserDefaults-artiger Gesamt-JSON-Blob | Gleichzeitiger Import, Rezeptmerge und Stoppabschluss benötigen überprüfbare Atomizität; Roundtrip-Portabilität bleibt A11. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `core/database/.../IndooroDatabase.kt`
- `core/database/.../ListDao.kt`
- `core/database/.../entities/`
- `domain/shopping/.../ShoppingRepository.kt`
- `domain/shopping/.../StopResolver.kt`
- `domain/shopping/.../MultiStopPlanner.kt`
- `domain/shopping/.../SessionReducer.kt`
- `feature/shopping/.../ShoppingScreen.kt`

## Risks / Trade-offs

Doppeltap oder Posewechsel während Check-off darf nicht zwei Stopps abschließen. Prozessende nach Commit muss gleiche Listenwerte wiederherstellen. R-C ändert Swift-Persistenz intern, nicht Android-Datenformat.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- Lists preserve edits and conservative merge semantics: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Persistence commits atomically and recovers visibly: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Sessions have explicit lifecycle: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Stops separate unresolved and unreachable items: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Ordering is deterministic and quantity aware: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Completion applies to the presented stop exactly once: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Android DB v1 beginnt leer mit Defaultliste. Zukünftige Migrationen explizit und mit Backups/Export getestet. Fehlerhafte DB nicht mit leerer überschreiben; Recovery-Ansicht und verwahrte Kopie. App-Downgrade auf inkompatible DB blockieren; Vorwärts-Hotfix statt destruktiver Neuinstallation empfehlen.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

D07 Backup-Policy: automatische Cloud-/Device-Transfers aus für private Listen; expliziter Export ist Portabilität. Bei Produktänderung separat neu entscheiden.
