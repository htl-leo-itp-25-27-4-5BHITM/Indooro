## ADDED Requirements

### Requirement: Lists preserve edits and conservative merge semantics
Local lists SHALL support create, rename, select, delete except the last list, item quantity/note/order/status editing and open product duplicates by product ID plus layout code.

#### Scenario: Duplikat
- **GIVEN** ein offenes Produkt hat Menge 2
- **WHEN** dasselbe Produkt mit gleichem layoutCode hinzugefügt wird
- **THEN** existiert ein Eintrag mit Menge 3

#### Scenario: Erledigtes Duplikat
- **GIVEN** der einzige gleiche Eintrag ist done
- **WHEN** das Produkt hinzugefügt wird
- **THEN** entsteht ein neuer offener Eintrag und der erledigte bleibt bestehen

### Requirement: Persistence commits atomically and recovers visibly
List and session mutations MUST commit transactionally, survive process death and never replace unreadable durable data silently with defaults.

#### Scenario: Absturz
- **GIVEN** ein Import enthält mehrere Items
- **WHEN** der Prozess vor Transaktionscommit endet
- **THEN** ist kein Teilimport sichtbar

#### Scenario: Korruption
- **GIVEN** die lokale DB kann nicht geöffnet werden
- **WHEN** die App startet
- **THEN** erscheint Recovery ohne die Datei zu überschreiben

### Requirement: Sessions have explicit lifecycle
Tour start, pause/resume, stop, list deletion and store switch SHALL have explicit transitions; item statuses survive tour stop and restored sessions SHALL require fresh positioning.

#### Scenario: Neustart
- **GIVEN** eine Tour lief beim Prozessende
- **WHEN** die App neu startet
- **THEN** ist Fortsetzen verfügbar, die Pose unbekannt und keine alte AR-Session aktiv

#### Scenario: Stop
- **GIVEN** die Tour hat erledigte Items
- **WHEN** Beenden gewählt wird
- **THEN** verschwinden Route und Prompt; erledigte Items bleiben erledigt

### Requirement: Stops separate unresolved and unreachable items
Snapshots SHALL group only open resolved products per shelf, preserve unresolved/free items and distinguish inaccessible shelves without inventing positions.

#### Scenario: Freie Zutat
- **GIVEN** eine freie Zutat besitzt keine Produkt-ID
- **WHEN** die Tour geplant wird
- **THEN** bleibt sie als ungeklärt sichtbar und kein Ziel wird erzeugt

### Requirement: Ordering is deterministic and quantity aware
Tour modes SHALL offer list order and nearest-neighbor graph distance, stable tie breaks and quantity-based progress; missing position SHALL use marked list order.

#### Scenario: Keine Position
- **GIVEN** drei routbare Stopps bestehen
- **WHEN** Optimiert ohne Startposition gewählt wird
- **THEN** werden Stopps in Listenreihenfolge mit Hinweis angeordnet

#### Scenario: Fortschritt
- **GIVEN** ein erledigter Eintrag hat Menge 3 und ein offener Menge 1
- **WHEN** Fortschritt berechnet wird
- **THEN** beträgt er 75 Prozent

### Requirement: Completion applies to the presented stop exactly once
Done/skip actions MUST carry displayed stop identity and snapshot revision; stale or repeated actions SHALL not complete a different stop.

#### Scenario: Race
- **GIVEN** Stopp A ist sichtbar und die nächste Berechnung setzt B zuerst
- **WHEN** Erledigt für die alte Revision bestätigt wird
- **THEN** wird die veraltete Aktion ohne Mutation abgewiesen und Tour aktualisiert – erneut bestätigen angezeigt; B wird niemals unbemerkt erledigt

#### Scenario: Doppeltap
- **GIVEN** derselbe Aktionsschlüssel wird zweimal geliefert
- **WHEN** die Transaktion verarbeitet wird
- **THEN** erfolgen Itemmutation und Upsell-Folgeereignis höchstens einmal
