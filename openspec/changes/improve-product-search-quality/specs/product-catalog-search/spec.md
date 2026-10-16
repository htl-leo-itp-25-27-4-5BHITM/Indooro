## ADDED Requirements

### Requirement: German product search handles compounds, umlauts, prefixes and synonyms
The product search SHALL match German compound names by word parts, SHALL treat umlauts and their ASCII forms as equivalent, SHALL return prefix matches while a customer is typing, and SHALL apply a maintained synonym list including Austrian terms. A search quality test set of at least 60 queries with expected top-3 results SHALL reach precision@3 of at least 0.85 before a changed index configuration is activated on LeoCloud, and activation SHALL use an index alias switch without deleting the previous index.

#### Scenario: Compound word
- **GIVEN** the catalog contains „S-BUDGET H-Milch 1L“
- **WHEN** a customer searches „milch“
- **THEN** that product is among the top 3 results

#### Scenario: Austrian synonym
- **GIVEN** the catalog contains „Tomaten passiert“
- **WHEN** a customer searches „Paradeiser“
- **THEN** that product is among the results

#### Scenario: Typing prefix
- **WHEN** a customer has typed „backp“
- **THEN** „Dr. Oetker Backpulver 10er Pack“ is among the top 3 results
