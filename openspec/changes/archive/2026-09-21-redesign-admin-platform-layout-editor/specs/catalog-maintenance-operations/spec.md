## ADDED Requirements

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
