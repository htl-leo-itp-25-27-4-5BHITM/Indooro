## ADDED Requirements

### Requirement: Rebuild-owned HTTP changes preserve reviewed consumers
Every rebuild-owned new or modified operation SHALL have a reviewed OpenAPI definition, access class, consumer list, request and response examples, and contract verification before its frontend route cuts over. Existing iOS and customer consumers SHALL remain compatible unless a separate versioned change specifies their migration.

#### Scenario: A rebuilt page needs a new operation
- **WHEN** implementation adds or changes an admin HTTP operation
- **THEN** `openspec/specs/shared-api/openapi.yaml`, resource behavior, tests, and the admin client agree on its path, method, auth, payload, and error response before the route is released

#### Scenario: Public layout response is affected
- **WHEN** editor publication changes persisted layout data
- **THEN** the anonymous current-layout response retains fields required by existing mobile and customer consumers and the compatibility fixture passes
