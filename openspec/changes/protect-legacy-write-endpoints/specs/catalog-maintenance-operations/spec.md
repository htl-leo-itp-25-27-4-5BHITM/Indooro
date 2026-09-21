## MODIFIED Requirements

### Requirement: OpenSearch product index can be initialized
The backend SHALL provide a catalog maintenance operation for creating the OpenSearch product index used by product search, and SHALL allow it only for authenticated users with the `admin` role.

#### Scenario: Product index is created
- **GIVEN** OpenSearch is reachable and the product index is absent
- **WHEN** an admin calls `POST /api/admin/index/create`
- **THEN** the backend creates the product index with the documented product field mappings

#### Scenario: Product index already exists
- **GIVEN** the product index already exists
- **WHEN** an admin calls the index-create endpoint again
- **THEN** the backend returns an explicit failure instead of silently redefining existing data

#### Scenario: Store manager tries to create the index
- **GIVEN** a user authenticated with the `store-manager` role
- **WHEN** they call `POST /api/admin/index/create`
- **THEN** the backend responds with HTTP 403

### Requirement: OpenSearch product index reset is destructive
The backend SHALL expose product index deletion only as an explicit maintenance/reset operation for authenticated users with the `admin` role because it removes indexed product data.

#### Scenario: Product index is deleted
- **GIVEN** an admin intentionally resets product search data
- **WHEN** they call `DELETE /api/admin/index`
- **THEN** the backend deletes the product index and the operator must recreate and reimport product data before search is complete

#### Scenario: Reset is considered for production
- **GIVEN** production-like product data exists
- **WHEN** a future change automates index reset
- **THEN** it must define authorization, backup, and recovery expectations before implementation

#### Scenario: Region manager tries to reset the index
- **GIVEN** a user authenticated with the `region-manager` role
- **WHEN** they call `DELETE /api/admin/index`
- **THEN** the backend responds with HTTP 403 and the index remains

### Requirement: PDF export creates belegplan PDFs from product data
The backend SHALL expose `POST /api/export/pdf` to authenticated users with the `admin` role to generate a PDF belegplan-style export from supplied product data.

#### Scenario: Product list is exported
- **GIVEN** an admin submits product JSON to `/api/export/pdf`
- **WHEN** PDF generation succeeds
- **THEN** the backend returns an `application/pdf` response with a download filename

#### Scenario: Export fails
- **GIVEN** the product payload or PDF generation fails
- **WHEN** the export endpoint cannot generate a valid PDF
- **THEN** the backend returns an explicit server error instead of a corrupt PDF

#### Scenario: Anonymous export
- **GIVEN** no authenticated session
- **WHEN** a client posts product JSON to `/api/export/pdf`
- **THEN** the backend responds with HTTP 401
