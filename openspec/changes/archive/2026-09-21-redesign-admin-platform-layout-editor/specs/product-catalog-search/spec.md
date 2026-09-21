## ADDED Requirements

### Requirement: Admin catalog shows product location readiness
The Admin Platform SHALL show whether catalog products have usable location metadata for the selected or target store while preserving the existing public product search contract.

#### Scenario: Admin reviews product list
- **WHEN** an `admin` reviews products in the redesigned catalog management UI
- **THEN** each product row or detail view indicates whether its layout code and store metadata are present, valid, unresolved, or non-routable

#### Scenario: Admin edits layout code
- **WHEN** an `admin` creates or updates a product layout code
- **THEN** the UI validates the documented layout-code shape where possible and warns when the product cannot be confidently mapped to a layout target

### Requirement: Admin product readiness does not change public search boundaries
The redesigned Admin Platform SHALL use product readiness indicators and admin validation without making anonymous customer product/category lookup require Admin Platform authentication.

#### Scenario: Anonymous customer searches products
- **WHEN** an anonymous customer calls existing public product or category routes after the admin redesign
- **THEN** those public routes remain available according to the existing product catalog search and admin authentication specs
