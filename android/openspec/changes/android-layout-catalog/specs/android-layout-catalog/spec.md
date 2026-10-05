## ADDED Requirements

### Requirement: Layout provenance remains visible
The app SHALL retain source/fallback/store/layout identifiers and SHALL distinguish live store layout, dated store cache and demo/default layout.

#### Scenario: Fallback
- **GIVEN** der Server meldet source DEFAULT und fallback true
- **WHEN** die Karte geöffnet wird
- **THEN** zeigt sie Demo/Default und bietet keine reale Filialnavigation

#### Scenario: Offline
- **GIVEN** ein validierter Cache derselben Filiale existiert
- **WHEN** das Laden fehlschlägt
- **THEN** bleibt er mit Offline-Datum sichtbar; ein fremder Storecache wird nicht verwendet

### Requirement: Layout decoding preserves spatial meaning
The decoder MUST retain known layout fields and aliases and SHALL reject non-finite or invalid grid geometry without replacing the last valid snapshot.

#### Scenario: Beschädigt
- **GIVEN** das neue gridSize ist negativ
- **WHEN** das Layout verarbeitet wird
- **THEN** bleibt die vorige gültige Revision mit Fehlerhinweis aktiv

### Requirement: Search has explicit thresholds and errors
Planning and map search SHALL start at three trimmed characters, use 80 and 50 results respectively, debounce typing and distinguish no results from network failure.

#### Scenario: Schnelles Tippen
- **GIVEN** mil und milch entstehen innerhalb 300 ms
- **WHEN** der Debounce abläuft
- **THEN** wird nur milch im aktuellen Store gesucht

#### Scenario: Zwei Zeichen
- **GIVEN** eine Suche ist aktiv
- **WHEN** auf mi gekürzt wird
- **THEN** wird die Anfrage invalidiert und Discovery beendet

### Requirement: Category browsing is honest about contract limits
The app SHALL offer the reference category shortcuts and name-based Bio/Demeter filters, but MUST NOT claim complete store-scoped category results until D03 is verified.

#### Scenario: Unvollständiger Vertrag
- **GIVEN** nur der globale 500er-Katalog ist verfügbar
- **WHEN** Milchprodukte geöffnet wird
- **THEN** steht eine Begrenzungs-/Global-Kennzeichnung im UI; es gibt keine bestätigte Store-Verfügbarkeit

#### Scenario: Textfilter
- **GIVEN** Bio Joghurt und Joghurt Natur sind in einer Kategorie
- **WHEN** Bio gewählt wird
- **THEN** bleibt nur der Namensmatch sichtbar; Freitextsuche wird nicht gefiltert

### Requirement: Product location resolution never guesses
The resolver SHALL match category segments and effective meter exactly, expose missing or ambiguous positions and separate price availability from routability.

#### Scenario: Präfixkollision
- **GIVEN** Kategorien 31 und 310 bestehen
- **WHEN** 310/2/1/1 aufgelöst wird
- **THEN** kann nur Kategorie 310 mit Meter 2 gewählt werden

#### Scenario: Fehlender Preis
- **GIVEN** ein Produkt hat eine gültige Position und null Preis
- **WHEN** es angezeigt wird
- **THEN** steht Preis unbekannt; eine valide Position bleibt routbar

### Requirement: Planning actions reflect local list state
Results SHALL show open duplicate state and offer add/focus actions; planning SHALL show up to seven open items plus an all-items link and static contextual suggestions.

#### Scenario: Achter Artikel
- **GIVEN** acht offene Einträge bestehen
- **WHEN** Planung geöffnet wird
- **THEN** werden sieben Vorschauen und Alle 8 Artikel angezeigt

#### Scenario: Fokus
- **GIVEN** eine Tour läuft
- **WHEN** ein einzelnes Produkt zur Karte fokussiert wird
- **THEN** wird die Tour gemäß A07 beendet und das Produkt als Einzelziel gesetzt
