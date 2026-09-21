# catalog-maintenance-operations Specification

## Purpose
Defines catalog maintenance behavior for OpenSearch-backed products and categories, including index setup/reset, write and bulk import endpoints, deployment readiness checks, health checks, and PDF export utilities.
## Requirements
### Requirement: OpenSearch product index can be initialized
The backend SHALL provide a catalog maintenance operation for creating the OpenSearch product index used by product search.

#### Scenario: Product index is created
- **GIVEN** OpenSearch is reachable and the product index is absent
- **WHEN** an operator calls `POST /api/admin/index/create`
- **THEN** the backend creates the product index with the documented product field mappings

#### Scenario: Product index already exists
- **GIVEN** the product index already exists
- **WHEN** an operator calls the index-create endpoint again
- **THEN** the backend returns an explicit failure instead of silently redefining existing data

### Requirement: OpenSearch product index reset is destructive
The backend SHALL expose product index deletion only as an explicit maintenance/reset operation because it removes indexed product data.

#### Scenario: Product index is deleted
- **GIVEN** an operator intentionally resets product search data
- **WHEN** they call `DELETE /api/admin/index`
- **THEN** the backend deletes the product index and the operator must recreate and reimport product data before search is complete

#### Scenario: Reset is considered for production
- **GIVEN** production-like product data exists
- **WHEN** a future change automates index reset
- **THEN** it must define authorization, backup, and recovery expectations before implementation

### Requirement: Product write endpoints maintain catalog documents
The backend SHALL support indexing one product with `POST /api/products` and bulk indexing many products with `POST /api/products/bulk`, and SHALL require the `admin` role plus an active Indooro admin assignment for both write paths.

#### Scenario: Single product is indexed
- **GIVEN** an authenticated `admin` supplies a valid product JSON document
- **WHEN** the client calls `POST /api/products`
- **THEN** the backend creates or updates the corresponding OpenSearch document

#### Scenario: Product list is bulk indexed
- **GIVEN** an authenticated `admin` supplies a JSON array of valid products
- **WHEN** the client calls `POST /api/products/bulk`
- **THEN** the backend indexes the supplied products in bulk and reports the processed count

#### Scenario: Non-admin attempts legacy product write
- **GIVEN** Keycloak authentication and Indooro access assignments are configured
- **WHEN** an anonymous user, `region-manager`, or `store-manager` calls `POST /api/products` or `POST /api/products/bulk`
- **THEN** the backend rejects the mutation without changing product catalog data

### Requirement: Catalog health check is available for operations
The backend SHALL provide a health check endpoint at `GET /api/admin/health` for deployment and smoke-test workflows.

#### Scenario: Backend is reachable
- **GIVEN** the backend process is running
- **WHEN** an operator calls `/api/admin/health`
- **THEN** the backend returns an UP-style response suitable for a smoke test

#### Scenario: Protected-route policy applies
- **GIVEN** Keycloak route protection is active
- **WHEN** `/api/admin/health` is evaluated
- **THEN** the expected authentication boundary must match the current `application.properties` permission policy and deployment verification notes

### Requirement: Product data is not automatically imported on deployment
The deployment SHALL NOT assume that product JSON files in the repository automatically populate OpenSearch; operators must trigger import or bulk indexing when catalog data is needed.

#### Scenario: Backend starts with empty index
- **GIVEN** the backend is deployed and OpenSearch is reachable
- **WHEN** no product import has been run
- **THEN** product search may return empty results even though the backend itself is healthy

#### Scenario: Operator imports demo data
- **GIVEN** `backend/indooro_server/belegplan.json` or another valid catalog file is available
- **WHEN** an authenticated admin posts it to `/api/products/bulk`
- **THEN** product search can return the imported documents

### Requirement: PDF export creates belegplan PDFs from product data
The backend SHALL expose `POST /api/export/pdf` to generate a PDF belegplan-style export from supplied product data.

#### Scenario: Product list is exported
- **GIVEN** a client submits product JSON to `/api/export/pdf`
- **WHEN** PDF generation succeeds
- **THEN** the backend returns an `application/pdf` response with a download filename

#### Scenario: Export fails
- **GIVEN** the product payload or PDF generation fails
- **WHEN** the export endpoint cannot generate a valid PDF
- **THEN** the backend returns an explicit server error instead of a corrupt PDF

### Requirement: Admin product writes use protected catalog maintenance API
The backend SHALL expose protected product catalog maintenance operations under `/api/admin/products` for Admin Platform product creation and updates.

#### Scenario: Admin indexes single product through admin API
- **GIVEN** an authenticated `admin` with an active Indooro access assignment submits a valid product document
- **WHEN** the client calls `POST /api/admin/products`
- **THEN** the backend validates the product and creates or updates the matching OpenSearch document

#### Scenario: Public search remains available
- **GIVEN** public customer product search routes are configured
- **WHEN** an anonymous customer calls product read or search endpoints under `/api/products`
- **THEN** product search/read behavior remains available without requiring an admin login

#### Scenario: Invalid admin product is submitted
- **GIVEN** an authenticated admin submits a product missing id, name, price, or layout code
- **WHEN** the backend validates the request
- **THEN** it returns a bad-request response and does not index the product

### Requirement: Catalog admin surfaces maintenance readiness
The redesigned Admin Platform SHALL provide catalog maintenance UI that separates routine product/category editing from higher-risk bulk/import/index maintenance and exposes readiness states for the catalog data used by search and layout navigation.

#### Scenario: Admin opens catalog management
- **WHEN** an `admin` opens catalog management
- **THEN** products and categories can be searched, filtered, sorted, inspected, created, edited, or removed through protected admin workflows with explicit loading, empty, validation, conflict, and error states

#### Scenario: Catalog has missing layout data
- **WHEN** products exist without usable layout codes, store context, category context, or routable position readiness
- **THEN** the UI marks those records as incomplete for navigation without blocking ordinary catalog search visibility

### Requirement: Bulk catalog operations are reviewed before commit
The redesigned Admin Platform SHALL guide bulk product/category imports through upload, parse, review, validation, conflict resolution, commit, and summary states before writing catalog data.

#### Scenario: Admin uploads bulk data
- **WHEN** an `admin` uploads product or category data for import
- **THEN** the UI shows parsed counts, validation errors, warnings, duplicate/conflict rows, and the exact commit action before sending write requests

#### Scenario: Bulk import fails partially
- **WHEN** a bulk import request fails or reports invalid rows
- **THEN** the UI preserves the review context and clearly separates saved, skipped, failed, and retryable records

### Requirement: Destructive catalog maintenance is isolated
The redesigned Admin Platform SHALL isolate destructive index or reset operations from routine product editing and SHALL require explicit confirmation and recovery guidance before such operations are triggered.

#### Scenario: Admin considers index reset
- **WHEN** an `admin` opens a destructive catalog maintenance action such as index reset
- **THEN** the UI explains that product data may need reimport, requires confirmation, and links to the relevant verification/recovery workflow

### Requirement: Category maintenance supports lookup and protected bulk import
The backend SHALL support public category listing and category-code lookup, and SHALL protect bulk category indexing as an admin-only catalog maintenance write path.

#### Scenario: Category code is requested
- **GIVEN** a category has been indexed
- **WHEN** an anonymous or authenticated client calls `GET /api/categories/{categoryCode}`
- **THEN** the backend returns the category or a not-found response without requiring Admin Platform login

#### Scenario: Categories are bulk imported
- **GIVEN** an authenticated `admin` with an active Indooro access assignment supplies a JSON array of category objects
- **WHEN** the client calls `POST /api/categories/bulk`
- **THEN** the backend indexes the categories and reports the count

#### Scenario: Non-admin attempts category bulk import
- **GIVEN** Keycloak authentication and Indooro access assignments are configured
- **WHEN** an anonymous user, `region-manager`, or `store-manager` calls `POST /api/categories/bulk`
- **THEN** the backend rejects the mutation without changing category catalog data

