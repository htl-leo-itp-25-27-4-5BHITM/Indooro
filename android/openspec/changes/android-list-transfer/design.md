## Context

**A11 – Interoperables Teilen, Exportieren und Importieren**. Im Code verifizierte Beobachtungen: [Matrix P65–P70](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: mobile-shopping-lists. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

A02, A07; iOS v1-Referenzdateien lokal synthetisch erzeugen. Kein Backend erforderlich.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

Unverändertes Transfer-v1-Format aus ShoppingTransferModels/Service, MIME application/vnd.indooro.shopping-list+json, Endung .indoorolist, JSON-Feldnamen exakt gemäß Swift-v1 (insbesondere `sourceListID` und `productID`), Exportdatum UTC mit ganzen Sekunden (`...Z`) für den bestehenden Swift-ISO8601-Decoder; Android-Import akzeptiert zusätzlich Sekundenbruchteile. Nur Artikel mit productID, price und layoutCode sind v1-fähig. Export zeigt Anzahl ausgeschlossener freier/unvollständiger Artikel vorab; v1 erfasst keine Rezept-/Upsellherkunft und keine Store-ID. Das ist eine belegte Formatgrenze, keine stillschweigende Vollständigkeit. V2 benötigt separaten gemeinsamen Change und iOS-Unterstützung.

FileProvider content://, ACTION_SEND+Chooser+temporäres Leserecht; ACTION_CREATE_DOCUMENT für dauerhaftes Speichern, ACTION_OPEN_DOCUMENT und eng gefasstes ACTION_VIEW für Import. Kein Storage-/All-files-Recht. ContentResolver-Stream in private Staging-Datei kopieren, Größenlimit beim Lesen durchsetzen, URI/Dateinamen niemals als lokale Pfade ausführen. Vorgeschlagene Grenzen 2 MiB, 1000 Items, quantity 1..100000, Name 500 und Notiz 4000 Zeichen; Grenzwerte sind Android-Planentscheid und werden im Interoptest gegen zulässige iOS-Exporte geprüft.

Android-Chooser-Auswahl ist kein Empfangsbeleg. Kopie teilen verändert nie Daten. Aus Liste senden speichert PendingTransfer mit unveränderlicher Auswahl und zeigt nach Rückkehr gesondert Mengen jetzt aus Liste entfernen; nur explizite Bestätigung zieht einmalig ab. Hat sich die Quelle geändert, erneute Vorschau statt stiller Subtraktion. Abbruch/Prozesstod entfernt nichts. Tempdatei nicht sofort bei Rückkehr löschen; 24-h-Ablauf/Startcleanup, solange Pending noch aktiv ist halten.

Import vollständig validieren→Vorschau→Neue Liste oder Merge→Room-Transaktion. Wiederholter Package-ID-Import wird erkannt und benötigt ausdrücklich Erneut importieren. Neue lokale IDs, Status/Ordnung erhalten; nur offene gleiche productID+layoutCode zusammenführen und Notizen konservativ mergen. Fehlende Store-ID bedeutet noch keine bestätigte Verfügbarkeit: vor Navigation Position im aktiven Store neu prüfen.

Offizielle Plattformbelege: [RESEARCH S10–S12](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| Transfer-v1 und explizite lokale Entnahme | Einseitiges v2 oder automatische Entnahme beim Sharesheetreturn | v1 erhält iOS-Interoperabilität; Android hat keinen belastbaren Empfangsbeleg für eine destruktive Automatik. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `feature/transfer/.../TransferV1Codec.kt`
- `feature/transfer/.../ImportValidator.kt`
- `feature/transfer/.../TransferViewModel.kt`
- `feature/transfer/.../ImportPreviewSheet.kt`
- `core/database/.../PendingTransferDao.kt`
- `app/src/main/res/xml/file_paths.xml`

## Risks / Trade-offs

Einige Dateianbieter melden application/json/octet-stream statt Custom-MIME. In explizitem Picker tolerieren und Inhalt validieren, kein globaler JSON-Intent-Hijack. Sendername/Notiz können private Angaben enthalten und dürfen nicht in Diagnoseprotokolle.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- V1 exports remain interoperable and disclose omissions: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Sharing grants only bounded content access: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Move requires explicit local confirmation: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Import validates before committing: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Preview controls create and merge: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Transfer survives interruption without data loss: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Erstimport ist die einzige geplante iOS→Android-Migration, Format v1 bleibt les-/schreibbar. Importledger und PendingTransfer in Room versionieren; rollback erhält Originaldatei und DB. Keine automatische Löschung von Originaldateien anderer Apps.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

D09: v2 für freie Zutaten/Store-/Rezeptmetadaten optionaler Folgeauftrag; vollständige v1-Parität enthält diese Einschränkungen.
