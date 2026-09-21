## MODIFIED Requirements

### Requirement: Planning tab structure is fixed
The „Planung“ tab SHALL render an inset-grouped list titled „Planung“ with the sections „Produkt hinzufügen“ (search field), a results section WHILE a search or category discovery is active, „Schon geplant“ (open items of the selected list), „Passt gut dazu“ (contextual quick searches), and „Kategorien“ (category shortcuts and certification filter), in this order.

#### Scenario: Tab opens without discovery
- **GIVEN** no search text and no selected category
- **WHEN** the planning tab is shown
- **THEN** no results section is shown and the other four sections are visible

### Requirement: Search results are sorted and actionable
The planning results SHALL be sorted by product name using localized case-insensitive comparison. Each result row SHALL show the product name, „Regal <layoutCode>“, the price formatted as „<0.00> EUR“, a checkmark WHILE the product is an open item of the selected list, a navigate button, and an add button labeled „Einplanen“ or „Noch eins“ for accessibility. WHILE a request is running the section SHALL show „Produkte werden gesucht...“, WHEN the request failed it SHALL show „Suche fehlgeschlagen“ with the error message and „Erneut versuchen“, and WHEN no products match it SHALL show „Keine passenden Produkte“.

#### Scenario: Product is already planned
- **GIVEN** „Vollmilch“ is an open item of the selected list
- **WHEN** it appears in the results
- **THEN** the row shows a checkmark and the add button's accessibility label is „Noch eins“

#### Scenario: Customer navigates to a result
- **GIVEN** a result row is visible
- **WHEN** the customer taps the navigate button
- **THEN** the app focuses the product on the map tab and clears the planning discovery state

#### Scenario: Backend returns an error
- **GIVEN** `GET /products/search` returns HTTP 500
- **WHEN** the customer searches „milch“
- **THEN** the section shows „Suche fehlgeschlagen“ and „Erneut versuchen“ instead of „Keine passenden Produkte“

#### Scenario: Retry after failure
- **GIVEN** „Suche fehlgeschlagen“ is shown
- **WHEN** the customer taps „Erneut versuchen“
- **THEN** the same search is sent again

### Requirement: Contextual quick searches depend on the selected category
The section „Passt gut dazu“ SHALL show a static, category-dependent set of quick-search chips (for no category: „Milch“, „Brot“, „Bananen“, „Kaffee“) and WHEN a chip is tapped the app SHALL clear the category, reset the certification filter, set the search text to the chip query, and search with `size=80`. These chips SHALL NOT be derived from customer purchase data, and their section title SHALL NOT claim that other customers bought the products.

#### Scenario: Chip is tapped
- **GIVEN** no category is selected
- **WHEN** the customer taps „Kaffee“
- **THEN** the search field contains „Kaffee“ and a search for „Kaffee“ is sent

#### Scenario: Section title is reviewed
- **GIVEN** the planning tab is shown
- **WHEN** the quick-search section is rendered
- **THEN** its title is „Passt gut dazu“
