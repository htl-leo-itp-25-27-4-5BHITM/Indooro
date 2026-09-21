## ADDED Requirements

### Requirement: Planning tab structure is fixed
The „Planung“ tab SHALL render an inset-grouped list titled „Planung“ with the sections „Produkt hinzufügen“ (search field), a results section WHILE a search or category discovery is active, „Schon geplant“ (open items of the selected list), „Kunden kauften ebenfalls“ (contextual quick searches), and „Kategorien“ (category shortcuts and certification filter), in this order.

#### Scenario: Tab opens without discovery
- **GIVEN** no search text and no selected category
- **WHEN** the planning tab is shown
- **THEN** no results section is shown and the other four sections are visible

### Requirement: Free-text product search starts after three characters
WHEN the trimmed search text in the planning tab has more than two characters, the iOS app SHALL clear any selected category, switch to search discovery, and request `GET /products/search` with `size=80`. WHEN the trimmed text has two or fewer characters and no category is selected, the app SHALL clear the results and leave discovery mode. WHEN the customer submits the field, the app SHALL additionally reset the certification filter, dismiss the keyboard, and scroll to the results section.

#### Scenario: Customer types „mi“
- **GIVEN** the search field is empty
- **WHEN** the customer types „mi“
- **THEN** no request is sent and no results section is shown

#### Scenario: Customer types „milch“
- **GIVEN** a category is selected
- **WHEN** the customer types „milch“
- **THEN** the category selection is cleared and a search with `q=milch&size=80` is sent

### Requirement: Search results are sorted and actionable
The planning results SHALL be sorted by product name using localized case-insensitive comparison. Each result row SHALL show the product name, „Regal <layoutCode>“, the price formatted as „<0.00> EUR“, a checkmark WHILE the product is an open item of the selected list, a navigate button, and an add button labeled „Einplanen“ or „Noch eins“ for accessibility. WHILE a request is running the section SHALL show „Produkte werden gesucht...“, and WHEN no products match it SHALL show „Keine passenden Produkte“.

#### Scenario: Product is already planned
- **GIVEN** „Vollmilch“ is an open item of the selected list
- **WHEN** it appears in the results
- **THEN** the row shows a checkmark and the add button's accessibility label is „Noch eins“

#### Scenario: Customer navigates to a result
- **GIVEN** a result row is visible
- **WHEN** the customer taps the navigate button
- **THEN** the app focuses the product on the map tab and clears the planning discovery state

### Requirement: Category shortcuts browse by layout-code prefix
The planning tab SHALL offer six quick categories („Obst & Gemüse“ → `310`, „Milchprodukte“ → `520`, „Backwaren“ → `445`, „Getränke“ → `510`, „Snacks“ → `470`, „Tiefkühlprodukte“ → `530`) and seven further categories via „Weitere Kategorie“ („Käse & Wurst“ → `525`, „Teigwaren & Nudeln“ → `430`, „Konserven & Saucen“ → `420`, „Müsli & Frühstück“ → `440`, „Öle & Essig“ → `450`, „Haushalt & Reinigung“ → `610`, „Körperpflege & Hygiene“ → `640`). WHEN a category is selected, the app SHALL clear the search text, dismiss the keyboard, request `GET /products?size=500`, keep only products whose `layoutCode` equals a prefix or starts with `<prefix>/`, and scroll to the results. WHEN the selected category is tapped again, the app SHALL deselect it and reset the certification filter.

#### Scenario: Customer selects „Milchprodukte“
- **GIVEN** the product catalog contains products with layout codes `520/1/1/1` and `310/1/1/1`
- **WHEN** the customer selects „Milchprodukte“
- **THEN** only the product with `520/1/1/1` is listed

#### Scenario: Customer deselects the category
- **GIVEN** „Milchprodukte“ is selected and the search text is empty
- **WHEN** the customer taps „Milchprodukte“ again
- **THEN** the results section disappears

### Requirement: Certification filter applies to category browsing
WHILE category discovery is active, the planning tab SHALL filter results with the picker „Kennzeichnung“ offering „Ohne Kennzeichnung“ (default; names without „bio“ and „demeter“), „Bio“ (names containing „bio“), and „Demeter“ (names containing „demeter“), using case- and diacritic-insensitive matching, and SHALL offer „Zurücksetzen“ to clear category and filter. The filter SHALL NOT apply to free-text search results.

#### Scenario: Bio filter selected
- **GIVEN** category results contain „Bio Joghurt“ and „Joghurt Natur“
- **WHEN** the customer selects „Bio“
- **THEN** only „Bio Joghurt“ is listed

### Requirement: Contextual quick searches depend on the selected category
The section „Kunden kauften ebenfalls“ SHALL show a static, category-dependent set of quick-search chips (for no category: „Milch“, „Brot“, „Bananen“, „Kaffee“) and WHEN a chip is tapped the app SHALL clear the category, reset the certification filter, set the search text to the chip query, and search with `size=80`. These chips SHALL NOT be derived from customer purchase data.

#### Scenario: Chip is tapped
- **GIVEN** no category is selected
- **WHEN** the customer taps „Kaffee“
- **THEN** the search field contains „Kaffee“ and a search for „Kaffee“ is sent

### Requirement: Planned items preview the selected list
The section „Schon geplant“ SHALL show „Noch keine Produkte“ with the hint „Suche oben oder tippe auf eine Kategorie.“ WHEN the selected list has no open items; otherwise it SHALL show the open-item count, an „Einkaufen“ button that opens the shopping tab, at most seven open items in list order with a destructive swipe action „Löschen“, and a link „Alle <n> Artikel anzeigen“ WHEN more items exist. WHEN an item is removed and the list is the active tour list, the app SHALL re-synchronize the tour.

#### Scenario: Ten items are planned
- **GIVEN** the selected list has ten open items
- **WHEN** the planning tab is shown
- **THEN** seven items and the link „Alle 10 Artikel anzeigen“ are shown

#### Scenario: Planned item is deleted during a tour
- **GIVEN** the selected list is the active tour list
- **WHEN** the customer deletes a planned item
- **THEN** the item is removed and the tour snapshot is rebuilt

### Requirement: Adding a product increments open duplicates
WHEN the customer adds a product, the iOS app SHALL add it to the selected list; IF an open item with the same product id and layout code exists THEN the app SHALL increment its quantity by one instead of creating a new item, and WHEN the list is the active tour list the app SHALL re-synchronize the tour.

#### Scenario: Product added twice
- **GIVEN** „Vollmilch“ with layout code `520/1/1/1` is open with quantity 1
- **WHEN** the customer adds it again
- **THEN** the list contains one „Vollmilch“ item with quantity 2
