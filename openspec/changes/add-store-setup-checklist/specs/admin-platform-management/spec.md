## ADDED Requirements

### Requirement: Store detail page guides the operator through store setup
The store detail page SHALL show a section "Einrichtung" with these steps in this order: store created, layout active, shelves labelled, beacons registered and placed, assortment imported, search finds the store's products, readiness without blocking findings. Each step SHALL have exactly one status of done, open, problem or unknown. The status SHALL be derived only from existing read endpoints (store, readiness report, current mobile layout, products and product search by store code). A step whose source did not load SHALL be unknown and SHALL NOT be done. Every step that is not done SHALL link to the page where it is fixed; a link to an admin-only page SHALL NOT be shown to other roles, who SHALL see a hint instead. The section SHALL link to the operator guide `MARKT_EINRICHTEN.md`.

#### Scenario: New store
- **GIVEN** an active store without layout, beacons or products
- **WHEN** the operator opens the store detail page
- **THEN** only "Markt angelegt" is done, the other steps are open, and the summary names the layout as the next step with a link to the editor

#### Scenario: Beacon inconsistency
- **GIVEN** a readiness report with a blocking beacon finding (all-zero UUID, missing major/minor, duplicate or mismatching identity, or a layout beacon that is not registered)
- **WHEN** the section is shown
- **THEN** the beacon step and the readiness step are problems and the beacon step links to the beacons page

#### Scenario: Empty catalog
- **GIVEN** a store with an active layout and no product whose store code equals the store's code
- **WHEN** the section is shown
- **THEN** the assortment step is open (or a problem when only products without a market exist) with a link to the CSV import, and the search step is open and waits for it

#### Scenario: A source fails to load
- **WHEN** the readiness request fails
- **THEN** the steps that need it are shown as "Nicht prüfbar" and the rest of the page keeps working
