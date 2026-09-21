# ios-recipe-experience Specification

## Purpose
Defines the „Rezepte“ tab of the iOS app: recipe list and search, German display normalization, store-aware recipe detail with ingredient mapping status, and the recipe-to-shopping-list sheet and hand-off.
## Requirements
### Requirement: Recipe tab loads published recipes
WHEN the „Rezepte“ tab appears and no recipes are loaded, the iOS app SHALL request `GET /mobile/recipes?page=0&size=20`. The tab SHALL show „Rezepte werden geladen“ WHILE loading with an empty list, SHALL show „Rezepte nicht erreichbar“ with the error message and „Erneut laden“ WHEN loading failed with an empty list, SHALL show „Keine Rezepte gefunden“ with „Sobald veröffentlichte Rezepte im Backend sind, erscheinen sie hier.“ and „Aktualisieren“ WHEN the list is empty, and SHALL support pull-to-refresh that repeats the current list or search request.

#### Scenario: Recipes load successfully
- **GIVEN** the backend has published recipes
- **WHEN** the recipe tab is opened for the first time
- **THEN** recipe cards with image, title, summary, servings, total time in minutes, and ingredient count are shown

#### Scenario: Backend unreachable
- **GIVEN** the network is unavailable
- **WHEN** the recipe tab is opened
- **THEN** „Rezepte nicht erreichbar“ and „Erneut laden“ are shown

### Requirement: Recipe search starts at two characters
WHEN the trimmed text of the searchable field „Rezepte suchen“ has at least two characters, the iOS app SHALL request `GET /mobile/recipes/search?q=<text>&page=0&size=20`; WHEN the field becomes empty, the app SHALL reload the unfiltered list; a single character SHALL NOT trigger a request.

#### Scenario: Customer searches „pasta“
- **GIVEN** the recipe list is visible
- **WHEN** the customer types „pasta“
- **THEN** only recipes returned by the search route are listed

#### Scenario: Customer clears the search
- **GIVEN** search results are shown
- **WHEN** the search text is cleared
- **THEN** the unfiltered first page is reloaded

### Requirement: Recipe texts are shown with German umlauts
The iOS app SHALL display recipe titles, summaries, tag names, preparation notes, ingredient names, and step instructions with ASCII transliterations such as „Gemuese“, „Kaese“, „Muesli“, „fuer“, and „ueber“ replaced by their umlaut forms.

#### Scenario: Title contains transliteration
- **GIVEN** a recipe title „Kaese-Nudel-Auflauf“
- **WHEN** it is displayed
- **THEN** the app shows „Käse-Nudel-Auflauf“

### Requirement: Recipe detail loads recipe and store-aware mapping together
WHEN a recipe detail opens, the iOS app SHALL request `GET /mobile/recipes/{id}` and `GET /mobile/recipes/{id}/product-mapping`, adding `storeId` and `storeCode` of the active layout store or, if none, of the detected store. The detail SHALL show „Rezept wird geladen“ WHILE the recipe is loading, „Rezept nicht geladen“ with „Erneut laden“ WHEN loading failed, and „Produktzuordnung wird geprüft“ WHILE the mapping is loading.

#### Scenario: Store is active
- **GIVEN** the active layout store is „EUROSPAR Leonding/Hart“
- **WHEN** the customer opens a recipe
- **THEN** the mapping request contains that store's id and code

#### Scenario: No store is known
- **GIVEN** no store is active or detected
- **WHEN** the customer opens a recipe
- **THEN** the mapping request is sent without store parameters

### Requirement: Ingredient mapping status is visible per ingredient
The recipe detail SHALL list ingredients by position with amount (quantity text or quantity plus display unit, where `piece` is omitted and `tbsp`, `tsp`, `pinch` are shown as „EL“, „TL“, „Prise“), cleaned name, preparation note, and a mapping badge: „Im Markt“ for `MAPPED`, „Ohne Regal“ for `PRODUCT_WITHOUT_LAYOUT`, „Auswahl nötig“ for `MULTIPLE_CANDIDATES`, „Nicht im Markt“ for `UNAVAILABLE_IN_STORE`, and „Nicht gefunden“ for `UNMAPPED` or a missing status. The detail SHALL list preparation steps under „Zubereitung“.

#### Scenario: Ingredient without shelf
- **GIVEN** an ingredient mapping has status `PRODUCT_WITHOUT_LAYOUT`
- **WHEN** the detail is shown
- **THEN** the ingredient shows the badge „Ohne Regal“

#### Scenario: Name repeats the amount
- **GIVEN** an ingredient with quantity text „200“, unit „g“, and display name „200 g Mehl“
- **WHEN** it is shown
- **THEN** the amount reads „200 g“ and the name reads „Mehl“

### Requirement: Add-to-list button requires mapping data
The recipe detail SHALL show a bottom button „Zur Einkaufsliste“ that is disabled WHILE no mapping response is available, and WHEN tapped SHALL present the sheet „Rezept hinzufügen“.

#### Scenario: Mapping still loading
- **GIVEN** the mapping request has not completed
- **WHEN** the detail is shown
- **THEN** „Zur Einkaufsliste“ is disabled

### Requirement: Recipe add sheet lets the customer choose list and ingredients
The sheet „Rezept hinzufügen“ SHALL offer a list picker preselected with the selected list, the toggle „Zutaten ohne Marktprodukt als freie Einträge behalten“ defaulting to on, a preview with „<n> Zutaten werden als Marktprodukte hinzugefügt“, „<n> Zutaten ohne Produkt bleiben sichtbar“ WHEN unmapped ingredients are selected, and „Wähle mindestens eine Zutat aus“ WHEN none is selected, and a selectable ingredient list with all ingredients preselected. „Hinzufügen“ SHALL be disabled WHILE no list or no ingredient is selected; „Abbrechen“ SHALL dismiss without changes.

#### Scenario: Customer deselects one ingredient
- **GIVEN** a recipe with five ingredients
- **WHEN** the customer deselects „Salz“ and taps „Hinzufügen“
- **THEN** only the four selected ingredients are processed

#### Scenario: Customer deselects all ingredients
- **GIVEN** the sheet is open
- **WHEN** all ingredients are deselected
- **THEN** „Hinzufügen“ is disabled and the hint „Wähle mindestens eine Zutat aus“ is shown

### Requirement: Adding a recipe hands off to the shopping tab
WHEN the customer confirms the recipe add sheet, the iOS app SHALL convert selected ingredients through the local shopping-list recipe merge and SHALL dismiss the sheet; IF at least one list item was created or changed THEN the app SHALL re-synchronize the shopping tour when the target list is the active tour list and SHALL select the „Einkaufen“ tab. A mapped ingredient whose product has no price or an empty layout code SHALL be treated like an unmapped ingredient.

#### Scenario: Recipe added to the active tour list
- **GIVEN** the target list is the active tour list
- **WHEN** the customer confirms the sheet
- **THEN** the tour snapshot includes the new stops and the shopping tab is shown

#### Scenario: Nothing to add
- **GIVEN** free entries are disabled and all selected ingredients are unmapped
- **WHEN** the customer confirms the sheet
- **THEN** the sheet closes, no list changes, and the recipe tab stays selected

#### Scenario: Product without layout code
- **GIVEN** an ingredient maps to a product without layout code and free entries are enabled
- **WHEN** the recipe is added
- **THEN** the ingredient is added as a free entry without product id

