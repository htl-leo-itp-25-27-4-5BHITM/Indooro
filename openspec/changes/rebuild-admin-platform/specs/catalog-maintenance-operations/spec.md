## ADDED Requirements

### Requirement: Admin catalog imports show reviewed outcomes
The Admin Platform SHALL parse selected product or category input before mutation, show row-level validation and conflicts, and submit only a reviewed set through authorized maintenance APIs. If the available API cannot guarantee the promised commit behavior, the UI SHALL block that import path and explain the missing capability rather than report an unverified success.

#### Scenario: Imported row is invalid
- **WHEN** a selected catalog file contains a product without a valid identifier, name, price, or supported layout code
- **THEN** the review step identifies the row and reason and does not submit it as a valid item

#### Scenario: Backend returns a partial result
- **WHEN** an authorized import returns a mixture of saved, skipped, and failed rows
- **THEN** the UI reports those counts and affected rows from the backend response and does not label the whole import successful

#### Scenario: Bulk transport outcome is ambiguous
- **WHEN** the bulk request loses its OpenSearch response after submission
- **THEN** the API reports every submitted row as unknown, and the UI keeps automatic commit and retry disabled until staff can reconcile the document IDs
