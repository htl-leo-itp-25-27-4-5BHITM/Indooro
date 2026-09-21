## ADDED Requirements

### Requirement: Product search supports admin mapping selection metadata
Product search results used by recipe mapping suggestions SHALL include enough product identity and location metadata for an admin to distinguish products before confirming a mapping.

#### Scenario: Mapping suggestions are requested
- **WHEN** the Admin Recipe Mapping UI requests product suggestions for an ingredient search term
- **THEN** the backend returns bounded product results containing product id, name, price where available, layout code where available, store id where available, and store code where available

#### Scenario: Product names collide
- **WHEN** multiple product results share the same or similar name
- **THEN** the response includes product id and location/store metadata so the Admin UI can distinguish them

#### Scenario: Product has no layout code
- **WHEN** a product suggestion has no usable layout code
- **THEN** the response still includes the product identity and the Admin UI can mark it as not routable
