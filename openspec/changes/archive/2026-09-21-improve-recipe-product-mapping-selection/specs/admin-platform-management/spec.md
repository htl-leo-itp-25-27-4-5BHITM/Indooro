## ADDED Requirements

### Requirement: Admin Recipe Mapping uses searchable product controls
The Admin Platform recipe mapping workflow SHALL provide a searchable product selection control for ingredient mappings and SHALL prevent saving arbitrary product names as mappings.

#### Scenario: Recipe mapping drawer opens
- **WHEN** an authenticated admin opens the recipe ingredient mapping drawer
- **THEN** each ingredient mapping panel exposes a product search/selection control instead of requiring manual product text entry

#### Scenario: Admin saves without selected product
- **WHEN** an admin types search text but has not selected a product result
- **THEN** the UI does not submit a mapping confirmation

#### Scenario: Existing mapping has product data
- **WHEN** an ingredient already has an active mapping
- **THEN** the mapping panel shows the confirmed product identity and allows the admin to search for a replacement or archive the mapping through existing mapping lifecycle behavior
