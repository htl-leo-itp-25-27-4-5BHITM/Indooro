## Context

**A09 – Rezeptkatalog, Zutatenstatus und Listenübernahme**. Im Code verifizierte Beobachtungen: [Matrix P52–P55](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: recipe-catalog-shopping, ios-recipe-experience, admin-recipe-product-mapping-selection. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

A02, A07; A03 StoreContext. R-AD/R-DA verbessern Datenqualität/Latenz, blockieren Android-Domain nicht.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

RecipeRepository mit unabhängigem Listen-, Detail- und Mappingzustand; RequestKey enthält recipeId+storeGeneration. Listen/Detail nicht im gleichen veränderlichen selectedRecipe-Singleton wie Swift, damit schnelle Navigation keine alten Details zeigt. Paging ab Seite 0/20, Servergrenze 50 beachten, mehr Seiten erreichbar machen (iOS lädt über UI nur erste Seite). Suche ab zwei Zeichen mit 300-ms-Debounce; ein Zeichen zeigt unveränderte Daten mit Suchhinweis und invalidiert ältere Anfragen.

Rezeptdetail zeigt Bild/Platzhalter, Summary/Description, Portionen, Zeiten, Tags, sortierte Zutaten und Schritte. Deutsche Rezeptanzeige übernimmt eng begrenzte belegte Transliterationstabelle; keine globale ae/oe/ue-Ersetzung und keine Veränderung von Identitäten. quantityText und Einheit bleiben getrennt von Paketanzahl; piece unterdrücken, tbsp/tsp/pinch als EL/TL/Prise. Bilder laden ohne Such-/Listendaten an Bildhost zu senden.

Mappingzustände MAPPED, UNMAPPED, MULTIPLE_CANDIDATES, UNAVAILABLE_IN_STORE, PRODUCT_WITHOUT_LAYOUT und Unknown sichtbar. Keine automatische Auswahl eines Kandidaten; bestätigte Produktzuordnung kommt vom Backend/Admin. Import-Sheet setzt alle Zutaten vorausgewählt, aktuelle Liste, freie Zutaten standardmäßig an. Nur ausgewählte Zutaten in einer Room-Transaktion, mapped über A07-Merge, freie nach Rezept/Name. Ein Produkt ohne Layout bleibt unroutbar statt freie Daten zu erfinden.

Offline: letzte geladene Rezeptdetails zum Lesen mit Datum; Mapping ist an Filiale gebunden. Eine bestehende Mappingvorschau wird bei Storewechsel invalidiert. Bei fehlendem aktuellen Mapping bleibt Produktübernahme gesperrt; bewusstes Übernehmen ausgewählter Zutaten als freie Einträge ist ein separater gekennzeichneter Offlineweg. Das erweitert nutzbare Offlinefunktion, ohne Verfügbarkeit zu behaupten.

Offizielle Plattformbelege: [RESEARCH S01, S03](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| Servermapping mit sichtbaren Status und freien Zutaten | Lokales Namensmatching oder automatische Auswahl mehrerer Kandidaten | Nur bestätigte Produktidentität erhält Datenvertrag; Clientheuristik könnte falsche Produkte und Regale erzeugen. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `core/network/.../RecipeRepository.kt`
- `feature/recipes/.../RecipeListViewModel.kt`
- `feature/recipes/.../RecipeDetailViewModel.kt`
- `feature/recipes/.../IngredientSelectionSheet.kt`
- `domain/shopping/.../AddRecipeIngredients.kt`

## Risks / Trade-offs

Admin-Rezeptedit kann aktuell Daten verlieren (R-AD). Das Android-UI darf fehlende Bilder/Tags nicht als Absturz behandeln. Mappingantwort kann stale sein; Bestätigung muss dieselbe Storegeneration sehen.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- Recipe catalog and details are complete and resilient: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Recipe search cancels outdated intent: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Mapping status never invents products: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Ingredient selection commits as one operation: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Offline mapping is explicit: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Cache pro recipeId und Store für Mapping, Versionierung getrennt von Listen. Übernommene Rezeptmetadaten bleiben unverändert beim Cache-Löschen. Keine Backend-Rezeptmutation durch Android; Rollback nur Feature/Cache, nicht Itemdaten.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

Keine Produktzuordnungsbearbeitung im Kundenclient; spätere Erweiterung benötigt eigenen Vertrag.
