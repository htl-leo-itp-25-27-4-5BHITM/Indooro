## ADDED Requirements

### Requirement: Shared contract is consumed without copying ownership
The client MUST consume the root shared-api contract and SHALL distinguish deployed legacy and planned versioned endpoints through explicit configuration.

#### Scenario: Versioniert
- **GIVEN** nur Legacy-Fixtures sind freigegeben
- **WHEN** das Produktionsprofil /api/v1 erwartet
- **THEN** schlägt der Vertragsgate fehl statt eine erfolgreiche Integration zu behaupten

### Requirement: Models tolerate optional data without fabricating values
Decoders SHALL preserve missing prices, layout positions, address and layout source metadata, accept unknown fields and ISO instants with or without fractions, and isolate invalid product entries.

#### Scenario: Teildefekt
- **GIVEN** drei Produkte enthalten ein ungültiges ID-Feld und ein null price
- **WHEN** die Antwort gelesen wird
- **THEN** bleiben zwei gültige Produkte sichtbar, der fehlende Preis heißt Preis unbekannt und ein Teilfehler wird gezählt

#### Scenario: Zeit
- **GIVEN** expiresAt enthält Mikrosekunden
- **WHEN** ein Plan gelesen wird
- **THEN** wird die Ablaufzeit korrekt verglichen und kein vollständiger Plan allein deswegen verworfen

### Requirement: Latest context wins
Every repeatable request SHALL be cancellable and MUST reject results whose environment, store generation or entity/query identity is no longer current.

#### Scenario: Filialwechsel
- **GIVEN** eine Layoutantwort für A ist unterwegs
- **WHEN** B gewählt wird und A später antwortet
- **THEN** bleibt B aktiv und A verändert weder Cache-Zuordnung noch UI

### Requirement: Errors and emptiness are distinct
Repositories SHALL expose loading, data, empty, offline, HTTP failure and malformed-data states; UI SHALL provide contextual retry without discarding local shopping data.

#### Scenario: Serverfehler
- **GIVEN** die Suche erhält HTML mit Status 500
- **WHEN** die Antwort verarbeitet wird
- **THEN** zeigt sie einen Serverfehler mit Wiederholen statt Keine Produkte

#### Scenario: Autorisierung
- **GIVEN** eine öffentliche Route gibt 401 oder 403
- **WHEN** die App sie lädt
- **THEN** zeigt sie einen Vertrags-/Zugriffsfehler und sendet keine Admin-Zugangsdaten

### Requirement: Retries are bounded and method aware
The transport MUST enforce the design timeouts and SHALL NOT automatically retry POST requests or 429 upsell plans.

#### Scenario: POST-Timeout
- **GIVEN** ein Plan könnte serverseitig bereits verbraucht sein
- **WHEN** nach 25 Sekunden keine Antwort vorliegt
- **THEN** wird die Anfrage lokal beendet und keine zweite Plananfrage automatisch gesendet

#### Scenario: GET-Retry
- **GIVEN** ein noch aktueller Leseabruf scheitert vorübergehend mit 503
- **WHEN** der einmalige Retry ebenfalls fehlschlägt
- **THEN** endet der Ladezustand mit einem Fehler

### Requirement: Network evidence excludes private content
Production networking SHALL log only route templates, status and duration, not bodies, free text, beacon identities or list identifiers.

#### Scenario: Logprüfung
- **GIVEN** synthetische Markerwerte stehen in Notiz und Suchtext
- **WHEN** Release-HTTP-Fehler erzeugt werden
- **THEN** tauchen Markerwerte in keinem Log auf
