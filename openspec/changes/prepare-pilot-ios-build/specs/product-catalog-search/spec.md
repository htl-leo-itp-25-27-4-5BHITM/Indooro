## ADDED Requirements

### Requirement: Mobile search encodes the query as a query item
The iOS client SHALL build product search URLs with URL components and query items so that reserved characters in the customer's query, including `&`, `+`, `=`, `#` and `?`, reach the backend unchanged as part of the `q` parameter. WHEN a search fails because of transport, HTTP status outside 200–299 or decoding, the client SHALL show „Suche fehlgeschlagen“ with a German reason and a „Erneut versuchen“ action instead of an empty result list. WHEN the search succeeds with zero results, the client SHALL show „Keine Treffer für „<Begriff>““.

#### Scenario: Ampersand in query
- **GIVEN** the customer searches „Milch & Käse“
- **WHEN** the request is sent
- **THEN** the backend receives `q` = „Milch & Käse“ and no additional query parameter

#### Scenario: Plus sign in query
- **GIVEN** the customer searches „a+b“
- **WHEN** the request is sent
- **THEN** the backend receives `q` = „a+b“, not „a b“

#### Scenario: Server error
- **GIVEN** the backend returns HTTP 503
- **WHEN** the customer searches
- **THEN** „Suche fehlgeschlagen“ and „Erneut versuchen“ are shown
