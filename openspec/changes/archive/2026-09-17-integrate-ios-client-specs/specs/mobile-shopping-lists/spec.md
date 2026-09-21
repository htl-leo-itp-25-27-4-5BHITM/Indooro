## ADDED Requirements

### Requirement: At least one local shopping list always exists
WHEN the iOS app starts with no stored lists, it SHALL create and select the list „Meine Einkaufsliste“. The app SHALL create new lists only with a non-empty trimmed name and insert them first and selected, SHALL rename lists only to non-empty trimmed names, SHALL refuse to delete the last remaining list, and SHALL select the first remaining list WHEN the selected list is deleted. Archived lists SHALL be hidden after loading.

#### Scenario: Customer deletes the only list
- **GIVEN** exactly one list exists
- **WHEN** the customer tries to delete it
- **THEN** the list remains and the delete action is not offered

#### Scenario: Customer creates a list
- **GIVEN** the alert „Neue Liste“ is open
- **WHEN** the customer enters „Wochenende“ and taps „Erstellen“
- **THEN** „Wochenende“ becomes the first and selected list

### Requirement: Shopping lists persist in versioned local storage
The iOS app SHALL persist all lists and the selected list id as one JSON document under the `UserDefaults` key `shoppingListStore.v1` after every mutation, SHALL increment a revision counter on every persist, SHALL persist the active tour list id under `shoppingSession.activeListID` and the route mode under `shoppingSession.routeMode`, and SHALL decode list items without `addedFromUpsell` as `false` and without recipe metadata as absent.

#### Scenario: App restarts during a tour
- **GIVEN** a tour was active when the app was terminated
- **WHEN** the app restarts
- **THEN** the same list is still the active tour list and the route mode is restored

#### Scenario: Item from an older app version
- **GIVEN** a stored item lacks `addedFromUpsell` and `sourceRecipeId`
- **WHEN** lists are loaded
- **THEN** the item decodes with `addedFromUpsell == false` and no recipe source

### Requirement: Open items can be edited and reordered
The iOS app SHALL allow changing an item's status, setting its quantity to at least 1, setting or clearing its trimmed note, removing items, clearing all completed items of a list, and reordering open items; reordering SHALL rewrite `sortOrder` of open items in the new order. New items SHALL receive `sortOrder` one greater than the current maximum.

#### Scenario: Customer moves an item to the top
- **GIVEN** open items A, B, C
- **WHEN** C is moved to the first position
- **THEN** the list order becomes C, A, B and route mode „Listenreihenfolge“ visits C's shelf first

#### Scenario: Completed items are cleared
- **GIVEN** a list with two done and one open item
- **WHEN** the customer chooses „Erledigtes entfernen“
- **THEN** only the open item remains

### Requirement: Shopping tour lifecycle is explicit
The iOS app SHALL start a tour only for a list with at least one open item („Tour starten“), SHALL offer „Tour fortsetzen“ and „Beenden“ WHILE the list is the active tour list, SHALL stop the tour before deleting its list, and WHEN the tour stops SHALL clear the snapshot, clear the route target, persist the state, and clear any visible upsell prompt. WHILE a tour is active, each synchronization SHALL rebuild the snapshot from the list, route mode, displayed or raw user position, grid size, and non-beacon layout elements, and SHALL set the route target to the current stop or clear it WHEN no stop remains.

#### Scenario: Tour list becomes empty
- **GIVEN** a tour is active
- **WHEN** the last open item is marked done
- **THEN** the route target is cleared and the tour panel shows „Alle Stopps erledigt!“

#### Scenario: Tour list is deleted
- **GIVEN** the active tour list is deleted from the menu
- **WHEN** the deletion completes
- **THEN** the tour was stopped first and no route target remains

### Requirement: Stop completion marks all items of the current stop
WHEN the customer marks the current stop done or skipped, the iOS app SHALL rebuild a fresh snapshot, SHALL set every item of its current stop to `done` or `skipped` respectively, and SHALL re-synchronize the tour so the next stop becomes the route target.

#### Scenario: Skip a stop
- **GIVEN** the current stop has items X and Y
- **WHEN** the customer taps „Überspringen“
- **THEN** X and Y have status `skipped` and count as completed for progress

### Requirement: Shopping progress counts quantities
The snapshot SHALL count total, remaining, unresolved, and completed products by summing item quantities, SHALL count total stops as the number of distinct resolved shelves over all items, and SHALL compute progress as completed quantity divided by total quantity (1.0 WHEN no products and no stops remain).

#### Scenario: Progress with quantities
- **GIVEN** a list with one done item of quantity 3 and one open item of quantity 1
- **WHEN** the snapshot is built
- **THEN** progress is 0.75

### Requirement: Items can be shared selectively with quantities
The iOS app SHALL export a full list as a package of kind `fullList` containing every product-backed item in list order with its status, and SHALL let the customer select open items with per-item quantities between 1 and the item quantity, showing „<n> von <m> Positionen, <k> Artikel ausgewählt“, „Alle“, and „Keine“. „Kopie teilen“ SHALL export a package of kind `itemSelection` without changing the list; „Aus Liste senden“ SHALL export the same package and, only WHEN the share sheet reports completion, subtract the shared quantities and remove items whose quantity reaches zero. Items without product id, price, or layout code SHALL NOT be exported, and a package without items SHALL be rejected with „Es wurden keine Artikel fuer den Transfer ausgewaehlt.“.

#### Scenario: Send part of an item
- **GIVEN** an open item „Äpfel“ with quantity 4
- **WHEN** the customer shares 3 via „Aus Liste senden“ and completes the share sheet
- **THEN** the package contains quantity 3 and the list keeps „Äpfel“ with quantity 1

#### Scenario: Send is cancelled
- **GIVEN** the customer chose „Aus Liste senden“
- **WHEN** the share sheet is dismissed without completing
- **THEN** the list quantities stay unchanged

#### Scenario: Free recipe entry
- **GIVEN** a free recipe ingredient without product id
- **WHEN** the full list is exported
- **THEN** the free entry is not part of the package

### Requirement: Imported packages can create or merge lists
WHEN a transfer package is previewed, the iOS app SHALL show its name, kind, sender, note, export date, and items with „Regal: <layoutCode>“, SHALL offer „Neue Liste erstellen und importieren“ with an editable name defaulting to the package list name or „Importierte Einkaufsliste“, and SHALL offer „In gewählte Liste zusammenführen“. Importing as a new list SHALL keep the package order as sort order and select the new list. Merging SHALL select the target list, SHALL add the quantity of an open package item to an existing open item with the same product id and layout code while merging notes, and SHALL otherwise append the item with the next sort order and the package item status. Packages that are not decodable, have a version other than 1, or contain no items SHALL be rejected with the localized errors „Die ausgewaehlte Datei ist keine gueltige Indooro-Einkaufsliste.“, „Diese Listen-Datei verwendet eine nicht unterstuetzte Version (<n>).“, or „Es wurden keine Artikel fuer den Transfer ausgewaehlt.“.

#### Scenario: Merge into a list with the same product
- **GIVEN** the target list has open „Milch“ quantity 1 and the package has „Milch“ quantity 2 with the same layout code
- **WHEN** the customer merges
- **THEN** the target list has „Milch“ quantity 3

#### Scenario: Package version is unsupported
- **GIVEN** a package with `version` 2
- **WHEN** it is opened
- **THEN** the error „Diese Listen-Datei verwendet eine nicht unterstuetzte Version (2).“ is shown

### Requirement: Export files are temporary and pretty-printed
WHEN a list or selection is exported, the iOS app SHALL encode the package as pretty-printed JSON with sorted keys and ISO-8601 dates, SHALL write it atomically to `<tmp>/ShoppingTransfers/<name>-<first 8 characters of the package id>.indoorolist`, where `<name>` is the package list name with the characters `/ \\ ? % * | " < > :` replaced by „-“, spaces replaced by „-“, and „einkaufsliste“ used for an empty result, SHALL present the system share sheet, and SHALL delete the file WHEN the share sheet is dismissed.

#### Scenario: List name contains slashes
- **GIVEN** a list named „Party/Samstag“
- **WHEN** it is exported
- **THEN** the file name starts with „Party-Samstag-“ and ends with `.indoorolist`

#### Scenario: File cannot be written
- **GIVEN** the temporary directory is not writable
- **WHEN** the export runs
- **THEN** the alert shows „Die Export-Datei konnte nicht erstellt werden.“
