## ADDED Requirements

### Requirement: Customer web derives product location from the layout code
The customer web page SHALL derive a product's category code and meter from its `layoutCode` (`<categoryCode>/<meter>/<level>/<position>`), SHALL show the category name from the category catalog in search results, and SHALL highlight the layout element whose category and meter match. Products without a parseable layout code SHALL be shown with the hint „Kein Regalplatz hinterlegt“ instead of an error dialog.

#### Scenario: Customer selects a product with a layout code
- **GIVEN** product „Milch“ with layout code `520/2/3/1` and a layout element with category `520/2`
- **WHEN** the customer selects the product in the results
- **THEN** that element is highlighted and the result shows the category name for code 520

#### Scenario: Customer selects a product without a layout code
- **GIVEN** a product whose `layoutCode` is null
- **WHEN** the customer selects it
- **THEN** the page shows „Kein Regalplatz hinterlegt“ and no alert dialog
