## ADDED Requirements

### Requirement: V1 exports remain interoperable and disclose omissions
The exporter SHALL write the reference v1 package with exact Swift field spellings and whole-second UTC export timestamps, and disclose non-exportable rows before sharing; copy export MUST NOT mutate the source list.

#### Scenario: Freie Zutat
- **GIVEN** eine Liste enthält zwei Produkte und eine freie Zutat
- **WHEN** Export vorbereitet wird
- **THEN** zeigt die Vorschau zwei exportierte und einen ausgeschlossenen Eintrag

#### Scenario: Kein Produkt
- **GIVEN** alle Items sind v1-inkompatibel
- **WHEN** Export gewählt wird
- **THEN** erscheint ein leerer-Transfer-Fehler und keine Datei wird geteilt

### Requirement: Sharing grants only bounded content access
Sharing SHALL use a non-exported FileProvider with narrow cache paths and temporary read grants; import/export SHALL use system document actions without broad storage permissions.

#### Scenario: Empfänger
- **GIVEN** eine Exportdatei wurde gewählt
- **WHEN** der Sharesheet-Empfänger liest sie
- **THEN** ist nur diese freigegebene content URI lesbar, nicht die Room-Datenbank

### Requirement: Move requires explicit local confirmation
Move-style sharing MUST NOT remove items based on chooser selection or return; source subtraction SHALL require explicit confirmation against an unchanged pending snapshot and be idempotent.

#### Scenario: Chooser abgebrochen
- **GIVEN** Aus Liste senden ist vorbereitet
- **WHEN** der Chooser geschlossen wird
- **THEN** bleiben alle Mengen unverändert

#### Scenario: Quelle geändert
- **GIVEN** die Menge wurde seit Vorbereitung geändert
- **WHEN** Entfernen bestätigt werden soll
- **THEN** erscheint eine neue Vergleichsvorschau und keine veraltete Subtraktion

### Requirement: Import validates before committing
The importer MUST reject unsupported version, empty/malformed/oversized data, invalid quantities and missing required product fields before any list mutation.

#### Scenario: Übergröße
- **GIVEN** ein Provider liefert mehr als 2 MiB
- **WHEN** der Stream gelesen wird
- **THEN** bricht Import begrenzt ab und es entsteht keine Liste

#### Scenario: Unbekannte Version
- **GIVEN** version ist 2
- **WHEN** die Datei geöffnet wird
- **THEN** erscheint Nicht unterstützte Version und die Quelle bleibt unangetastet

### Requirement: Preview controls create and merge
Import SHALL preview metadata/items, allow cancel/new/merge, preserve statuses/order and merge only open equal product/layout identities in one transaction.

#### Scenario: Gemischt
- **GIVEN** offenes gleiches Produkt und erledigtes Produkt sind im Paket
- **WHEN** Merge bestätigt wird
- **THEN** wird nur das offene zusammengeführt; das erledigte separat angehängt

#### Scenario: Doppelimport
- **GIVEN** dieselbe package id wurde bereits importiert
- **WHEN** sie erneut geöffnet wird
- **THEN** fragt die Vorschau ausdrücklich nach Erneut importieren statt sofort Mengen zu addieren

### Requirement: Transfer survives interruption without data loss
Pending previews SHALL recover safely after recreation; temporary exports SHALL remain readable for the bounded retention period and be cleaned without touching user documents.

#### Scenario: Prozesstod
- **GIVEN** ein Move wurde geteilt aber nicht bestätigt
- **WHEN** die App neu startet
- **THEN** bleiben Quellmengen vollständig und der Pending-Status ist sichtbar


### Requirement: Transfer wire spelling is stable
The v1 codec MUST preserve sourceListID and productID field spellings and SHALL emit exportedAt without fractional seconds for existing Swift compatibility.

#### Scenario: Android file opens in existing iOS
- **GIVEN** a synthetic Android-exported package contains a product-backed item
- **WHEN** the current Swift ShoppingTransferService decodes it
- **THEN** sourceListID, productID, exportedAt and item quantity are preserved without a date or key decoding failure
