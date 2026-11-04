## ADDED Requirements

### Requirement: Admin search index page manages reindex and activation
The Admin Platform SHALL provide an admin-only page "Suchindex" at `/admin/next/search-index/` that shows the alias, the version indices with their document counts and whether each carries the alias, and the source index with its count. It SHALL offer "Reindex starten", which shows the source and target counts returned by the server, and "Aktivieren" for every version that does not carry the alias, which SHALL ask for confirmation naming the alias, the version and both counts before the request is sent. The page SHALL NOT send `force=true`. A count that could not be read SHALL be shown as unreadable and SHALL NOT be shown as `0` or as equal to the source. Region managers and store managers SHALL see no navigation entry, SHALL receive "Zugriff verweigert" on a direct link and SHALL cause no request to the index endpoints.

#### Scenario: Confirmation before activation
- **GIVEN** the alias points to `products_v1` and `products_v2` exists
- **WHEN** the admin selects "Aktivieren" for `products_v2` and dismisses the dialog
- **THEN** no activation request is sent and the alias stays on `products_v1`

#### Scenario: Count mismatch on activation
- **WHEN** the server answers the activation with `409`
- **THEN** the page shows the server message with both counts and keeps the alias as it is

#### Scenario: Unreadable count
- **GIVEN** the overview reports `docCount: null` for a version
- **WHEN** the page renders
- **THEN** it shows "nicht lesbar" and "nicht vergleichbar" for that version
