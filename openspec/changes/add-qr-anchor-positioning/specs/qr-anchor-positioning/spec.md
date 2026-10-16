## ADDED Requirements

### Requirement: Layouts can contain QR anchors
A store layout SHALL support elements of type `anchor` with a unique `anchorId` matching `[A-Z0-9-]{1,12}`, coordinates and a label. Layout validation in the editor and the backend SHALL reject duplicate anchor ids, and the mobile layout response SHALL include anchors unchanged.

#### Scenario: Duplicate anchor id
- **GIVEN** a layout draft with two anchors „A1“
- **WHEN** the layout is saved for publication
- **THEN** validation reports the duplicate and the version is not activated

### Requirement: Scanning an anchor sets a trusted position
The iOS app SHALL offer „QR-Code scannen“ on the indoor map. WHEN a scanned URL contains the active store's code and an anchor id present in the active layout, the app SHALL set a trusted manual position at the anchor's nearest walkable point and rebuild the route once. WHEN the store code differs, the app SHALL offer to switch to that store. WHEN the anchor is unknown, the app SHALL show „Unbekannter Code – bitte anderen Code scannen“.

#### Scenario: Anchor at aisle 4
- **GIVEN** the active store EUROSPAR Leonding with anchor „A12“ at the start of aisle 4
- **WHEN** the customer scans the code of „A12“
- **THEN** the position is set to that point, marked as trusted, and the route to the active stop starts there

### Requirement: Admins can print anchor codes
The admin platform SHALL generate a printable A4 sheet for the active layout of a store with one QR code per anchor, the anchor label, the store name and the hint „Scannen, um deinen Standort zu setzen“, encoding `https://<host>/customer/?store=<storeCode>&a=<anchorId>`.

#### Scenario: Print sheet
- **GIVEN** a store layout with 8 anchors
- **WHEN** a store manager opens „QR-Codes drucken“
- **THEN** the print preview shows 8 codes with labels on two A4 pages
