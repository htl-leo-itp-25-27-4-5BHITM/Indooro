## ADDED Requirements

### Requirement: Recipe catalog and details are complete and resilient
The recipe UI SHALL expose published list/search, pagination, refresh, detail images/text/times/tags, ordered ingredients/steps and explicit loading/empty/error states.

#### Scenario: Mehr Seiten
- **GIVEN** 21 veröffentlichte Rezepte existieren
- **WHEN** das Listenende erreicht wird
- **THEN** ist auch Rezept 21 erreichbar

#### Scenario: Bildfehler
- **GIVEN** Rezepttext ist geladen, Bildabruf scheitert
- **WHEN** Detail erscheint
- **THEN** bleiben Zutaten und Schritte mit Bildplatzhalter lesbar

### Requirement: Recipe search cancels outdated intent
Search SHALL start at two trimmed characters and clearing SHALL reload the first page; stale detail or mapping responses MUST NOT overwrite another recipe/store.

#### Scenario: Schneller Wechsel
- **GIVEN** Detail A lädt
- **WHEN** B geöffnet wird und A später antwortet
- **THEN** bleiben Titel und Zutaten von B zusammengehörig

### Requirement: Mapping status never invents products
Every ingredient SHALL show its mapping state and SHALL NOT invent IDs/prices/locations or silently choose from multiple candidates.

#### Scenario: Mehrdeutig
- **GIVEN** eine Zutat hat MULTIPLE_CANDIDATES
- **WHEN** sie zur Liste übernommen wird
- **THEN** entsteht bei aktivierter freier Übernahme ein freier Eintrag, kein geratenes Produkt

### Requirement: Ingredient selection commits as one operation
Add-to-list SHALL allow list/ingredient selection, free-item toggle and preview, preserve source amounts separately and merge through A07 atomically.

#### Scenario: Auswahl
- **GIVEN** fünf Zutaten sind vorausgewählt
- **WHEN** eine abgewählt und Hinzufügen bestätigt wird
- **THEN** werden exakt vier verarbeitet, Quelle/Einheit bleiben erhalten

#### Scenario: Abbruch
- **GIVEN** eine Auswahl wurde geändert
- **WHEN** Abbrechen betätigt wird
- **THEN** bleibt jede Liste unverändert

### Requirement: Offline mapping is explicit
Cached recipe content SHALL remain readable with provenance; current store mapping SHALL be required for product-backed additions, while explicit free-ingredient addition MAY work offline.

#### Scenario: Storewechsel
- **GIVEN** Mapping für A ist geladen
- **WHEN** B gewählt wird
- **THEN** ist die alte Produktübernahme gesperrt und B-Mapping lädt neu

#### Scenario: Offline frei
- **GIVEN** kein Mapping verfügbar
- **WHEN** Als freie Zutaten übernehmen ausdrücklich bestätigt wird
- **THEN** entstehen nur freie Einträge ohne Produkt-ID/Preis/LayoutCode
