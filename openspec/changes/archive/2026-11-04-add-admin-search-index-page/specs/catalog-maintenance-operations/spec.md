## ADDED Requirements

### Requirement: Admin can read the search index state
`GET /api/admin/index` SHALL be restricted to role `admin` (HTTP 401 without login, 403 for other roles) and SHALL return the alias name, the source index with its document count, the version indices `<prefix><N>` in ascending order with their document counts and an `active` flag, and the version indices that carry the alias. The call SHALL NOT create, change or delete an index or alias. A document count that cannot be read SHALL be `null`. An unreachable search cluster SHALL answer 503 without internal details.

#### Scenario: Overview with an unreadable count
- **GIVEN** the count of `products_v2` fails
- **WHEN** an admin calls `GET /api/admin/index`
- **THEN** the response lists `products_v2` with `docCount: null` and the other versions with their counts
