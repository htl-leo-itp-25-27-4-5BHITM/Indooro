# Catalog bulk import status

## Current behavior

The admin catalog drawer accepts a JSON array or newline-delimited JSON and now
shows a row review before any request is made. It checks product IDs, names,
finite nonnegative prices, four-part numeric layout codes, category codes and
names, and duplicate IDs/codes in the submitted file. Invalid rows and their
reasons remain visible in the review. Parsing and review do not write data.

Commit is intentionally disabled in the candidate UI. Both legacy bulk routes
now expose one ordered result per submitted item (`row`, `id`, `status`,
`reason`), with `saved`, `failed`, and `unknown` counts. A 200 response can
contain failed rows. Product writes request an OpenSearch refresh before the
response. Duplicate IDs/codes in the same request are rejected before writing.
The routes remain admin-only, and existing documents with the same ID are
upserted rather than treated as conflicts. Bulk writes have no rollback.

On an I/O failure after submission, either route returns 503 with every row
`unknown`. This does not assert that no write occurred. Staff must inspect the
affected IDs before any retry. There is no server preview, existing-record
conflict check, idempotency key, or atomic transaction for either catalog.

## Capability needed to enable commit

Verify the new contract against a packaged live image with successful,
partial-failure, and ambiguous-transport cases plus per-row readback. Define
whether candidate imports intentionally overwrite existing documents and how
staff reconcile unknown rows. Only then enable the candidate commit control
and summarize the backend results. If all-or-nothing behavior is required,
OpenSearch bulk alone cannot provide it.

## Evidence

On 2026-10-14, `ADMIN_SMOKE_HOST_ALIAS=1 npm run test:live:catalog`
passed against the packaged local image
`sha256:afdd55f95e6784c79dc648abacd41c3951b4b8b0dea70aa1287060a80ab63a39`.
The admin wrote category codes 903 and 904 and product IDs 901918478 and
901918479 in two-row bulk requests. Each ordered API row reported `saved`,
and subsequent anonymous GETs returned the exact names and product prices.
Duplicate ID/code requests returned 400, and GET confirmed that their new
target IDs had not been created. The focused backend tests injected a mixed
BulkResponse and a transport IOException, but those two failure types have
not been induced against the packaged OpenSearch service. This is not a
candidate import Commit gate or route cutover approval.

- Product validation and route response: `ProductResource.indexProducts`.
- Product row-result handling: `OpenSearchService.indexProducts` and
  `CatalogBulkResult.fromResponse`.
- Category validation: `CategoryService.bulkInsert`.
- Category row-result handling: `CategoryResource.bulkInsert` and
  `CategoryRepository.bulkIndex`.
- Focused tests: `CatalogBulkResultTest`, `CategoryServiceBulkTest`,
  `ProductResourceBulkTest`, and `CategoryResourceSecurityTest`.
- Admin review and blocked commit: `META-INF/resources/admin/app.js`.
