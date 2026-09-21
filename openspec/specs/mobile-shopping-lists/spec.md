# mobile-shopping-lists Specification

## Purpose
Defines local iOS shopping-list behavior, including locally persisted lists, item status, shelf-stop resolution, route ordering modes, transfer packages, and the boundary against backend-synchronized customer lists.
## Requirements
### Requirement: Shopping lists are local mobile app state
The mobile app SHALL support local customer shopping lists without requiring server-side customer accounts or server-side customer tracking.

#### Scenario: Customer creates a list
- **GIVEN** the customer is using the iOS app
- **WHEN** they create a shopping list with a non-empty name
- **THEN** the list is persisted locally on the device

#### Scenario: Customer identity is absent
- **GIVEN** shopping-list state exists locally
- **WHEN** the app stores list data
- **THEN** it does not require a backend customer identity

### Requirement: Products can be added to shopping lists
The mobile app SHALL allow a searched product to be added to a shopping list with product id, name, price, layout code, quantity, optional note, and item status.

#### Scenario: Product is added
- **GIVEN** a product search result has product identity and layout code data
- **WHEN** the customer adds it to a shopping list
- **THEN** the app stores a list item that can later be resolved to a shelf target

#### Scenario: Duplicate open product exists
- **GIVEN** the selected list already contains the same open product and layout code
- **WHEN** the customer attempts to add it again
- **THEN** the app prevents duplicate open entries or updates the existing local list state according to the implemented UI behavior

### Requirement: Shopping item statuses are explicit
The mobile app SHALL track shopping item state as open, done, missing, or skipped so a shopping session can distinguish routable and completed items.

#### Scenario: Item is marked done
- **GIVEN** an open shopping item is visible in a shopping session
- **WHEN** the customer marks it done
- **THEN** the item is counted as completed and removed from remaining route stops

#### Scenario: Item cannot be found
- **GIVEN** the customer cannot find an item at the target shelf
- **WHEN** they mark it missing or skipped
- **THEN** the item is treated as completed for session progress without claiming the product was purchased

### Requirement: Shopping stops resolve by layout code
The mobile app SHALL group open shopping items into route stops by resolving product layout codes to shelf/layout elements in the active layout.

#### Scenario: Multiple items share a shelf
- **GIVEN** multiple open items resolve to the same shelf element
- **WHEN** the app builds a shopping route snapshot
- **THEN** those items are grouped into one stop

#### Scenario: Item cannot be resolved
- **GIVEN** a shopping item has no matching shelf/layout element
- **WHEN** the route snapshot is built
- **THEN** the item appears as unresolved instead of being placed at an invented map target

### Requirement: Shopping route order supports list order and optimized mode
The mobile app SHALL support route stop ordering by list order and by an optimized nearest-next-stop mode when user position and layout graph data are available.

#### Scenario: List-order mode is selected
- **GIVEN** a shopping list has multiple resolved stops
- **WHEN** route mode is list order
- **THEN** stops are ordered by the item/list order seed

#### Scenario: Optimized mode is selected
- **GIVEN** a user position and routable layout graph are available
- **WHEN** route mode is optimized
- **THEN** the app may order stops by estimated route distance from current position and previously selected stops

### Requirement: Shopping transfer files are versioned
The mobile app SHALL export and import shopping lists through a versioned Indooro shopping-list transfer package.

#### Scenario: List is exported
- **GIVEN** a selected shopping list has at least one item
- **WHEN** the customer exports or shares it
- **THEN** the app writes a versioned `.indoorolist` package containing transfer items

#### Scenario: Unsupported transfer version is imported
- **GIVEN** the customer imports an Indooro shopping-list file
- **WHEN** the package version is unsupported
- **THEN** the app rejects the import with a clear error state

### Requirement: Shared backend shopping lists are future scope
The system SHALL NOT treat local mobile shopping lists as shared backend shopping-list persistence unless a future OpenSpec change defines customer identity, synchronization, conflict handling, and privacy boundaries.

#### Scenario: Backend sync is requested
- **GIVEN** local shopping-list functionality exists
- **WHEN** a future change requests cross-device or server-backed shopping lists
- **THEN** the proposal must define identity, storage, synchronization, and privacy behavior before implementation

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

### Requirement: Recipe-sourced shopping items keep source metadata
The mobile app SHALL preserve optional recipe source metadata on shopping-list items added from recipes without requiring that metadata for normal product-added items.

#### Scenario: Mapped recipe ingredient is added
- **GIVEN** a recipe ingredient maps to a product
- **WHEN** the customer adds the recipe to a local shopping list
- **THEN** the created or updated shopping-list item stores product identity, product name, price where available, layout code where available, quantity, sourceRecipeId, sourceRecipeName, ingredientName, ingredientQuantity, ingredientUnit, mappingConfidence, and manuallyConfirmed where available

#### Scenario: Normal product is added
- **GIVEN** the customer adds a searched product outside the recipe flow
- **WHEN** the product is saved to the local shopping list
- **THEN** the item remains valid without recipe source metadata

### Requirement: Recipe add flow converts mapped ingredients through existing product list logic
The mobile app SHALL convert mapped recipe ingredients into normal local shopping-list products so existing shopping-tour grouping, layout resolution, and route ordering can process them.

#### Scenario: Mapped ingredients are confirmed
- **GIVEN** a recipe has mapped ingredients with product ids and layout codes
- **WHEN** the customer confirms adding mapped ingredients
- **THEN** the app adds them through the existing shopping-list manager path and they can be routed like other product list items

#### Scenario: Active shopping session exists
- **GIVEN** a shopping session is active for the selected list
- **WHEN** recipe ingredients are added to that list
- **THEN** the session snapshot is refreshed so new mapped products can appear in remaining stops

### Requirement: Unmapped recipe ingredients remain visible
The mobile app SHALL handle recipe ingredients without confirmed product mappings explicitly and SHALL NOT invent product ids, prices, layout codes, or shelf locations for them.

#### Scenario: Unmapped ingredient is shown before adding
- **GIVEN** a recipe contains an unmapped ingredient
- **WHEN** the add-to-shopping-list sheet is opened
- **THEN** the ingredient is shown with an unmapped status and clear indication that it will not produce a routable product unless added as a free entry

#### Scenario: Free ingredient entry is added
- **GIVEN** the customer chooses to keep an unmapped ingredient on the shopping list
- **WHEN** the app creates a local free ingredient entry
- **THEN** the entry has no product id and no layout code, preserves ingredient quantity/unit/source metadata, and appears as unresolved in shopping-tour context

#### Scenario: Unmapped ingredient is skipped
- **GIVEN** the customer does not want to add an unmapped ingredient
- **WHEN** the recipe is added to the list
- **THEN** the ingredient is excluded from shopping-list items while remaining visible in the recipe add summary

### Requirement: Recipe-sourced duplicates are merged conservatively
The mobile app SHALL avoid uncontrolled duplicate open items when a recipe adds products already present on the selected local shopping list.

#### Scenario: Same open product exists
- **GIVEN** the selected list already contains an open item with the same product id and layout code
- **WHEN** a recipe adds that mapped product again
- **THEN** the app updates the existing open item quantity or note/source metadata instead of adding an uncontrolled duplicate row

#### Scenario: Same ingredient appears in multiple recipes
- **GIVEN** two recipes add ingredients that map to the same product
- **WHEN** both recipes are added to the same list
- **THEN** the local list preserves enough source or note metadata for the customer to understand the recipe origin while still keeping one open product item where merge rules apply

#### Scenario: Completed product exists
- **GIVEN** the selected list contains a completed item for the same product
- **WHEN** a recipe adds that product
- **THEN** the app creates or reopens an appropriate open item rather than treating the completed purchase as satisfying the new recipe need

### Requirement: Recipe quantity and package quantity are not automatically optimized
The mobile app SHALL preserve recipe amounts separately from shopping-list item quantity and SHALL NOT claim exact package optimization unless explicit mapping data supports it.

#### Scenario: Eggs map to a carton
- **GIVEN** a recipe ingredient says `2 eggs` and maps to a `10 eggs` product
- **WHEN** the ingredient is added to the shopping list
- **THEN** the shopping-list item defaults to a conservative package quantity such as 1 and preserves `2 eggs` in recipe metadata or note text

#### Scenario: Flour maps to one kilogram package
- **GIVEN** a recipe ingredient says `250 g flour` and maps to a `1 kg flour` product
- **WHEN** the ingredient is added to the shopping list
- **THEN** the app does not convert the shopping-list item to a fractional package quantity

### Requirement: Recipe-sourced unresolved items do not break navigation
The shopping route snapshot SHALL continue to separate unresolved items from routable stops when recipe-sourced items lack a product, layout code, or matching shelf element.

#### Scenario: Free ingredient has no layout
- **GIVEN** a local shopping list contains a free recipe ingredient entry
- **WHEN** the app builds the shopping route snapshot
- **THEN** the free entry appears in unresolved items and no route stop is invented

#### Scenario: Mapped product lacks shelf match
- **GIVEN** a mapped recipe product has a layout code that does not resolve in the active layout
- **WHEN** the app builds the shopping route snapshot
- **THEN** the item appears unresolved and the rest of the shopping tour remains usable

### Requirement: Shopping completion can trigger non-blocking upsell prompts
The mobile app SHALL allow product completion in shopping-list and active-session flows to trigger a non-blocking upsell prompt opportunity without changing the existing completion semantics.

#### Scenario: Open item is checked off from the list
- **GIVEN** a product-backed open shopping item is visible in the shopping-list screen
- **WHEN** the customer marks it done
- **THEN** the item is immediately counted as completed and the app can request an upsell prompt opportunity afterward

#### Scenario: Current route stop is completed
- **GIVEN** an active shopping session has a current route stop
- **WHEN** the customer marks the current stop done
- **THEN** the route advances as before and the app can evaluate one upsell prompt opportunity for the completed stop

#### Scenario: Current route stop is skipped
- **GIVEN** an active shopping session has a current route stop with product-backed items
- **WHEN** the customer skips the current stop
- **THEN** the route advances as before and the app can evaluate one upsell prompt opportunity for the skipped stop without blocking navigation

#### Scenario: Upsell request fails
- **GIVEN** an upsell request fails, times out, or returns no suggestions
- **WHEN** the customer has marked an item done
- **THEN** the item remains done and the shopping session remains usable

### Requirement: Accepted upsell products reuse local list behavior
The mobile app SHALL add accepted upsell suggestions through the existing local product-add logic so duplicate handling, quantity behavior, persistence, and route refresh remain consistent.

#### Scenario: Suggested product is accepted
- **GIVEN** an upsell suggestion contains a product id, name, price, and layout code where available
- **WHEN** the customer adds the suggestion
- **THEN** the app creates or updates a normal local shopping-list item using the existing product add behavior

#### Scenario: Active session targets the selected list
- **GIVEN** the accepted suggestion is added to the list used by the active shopping session
- **WHEN** the item is persisted locally
- **THEN** the session snapshot is refreshed so the new product can appear in remaining stops or unresolved items

#### Scenario: Suggested product lacks routable layout
- **GIVEN** the accepted suggestion has no usable layout code or shelf match
- **WHEN** the shopping route snapshot is rebuilt
- **THEN** the added item appears as unresolved instead of breaking route calculation

