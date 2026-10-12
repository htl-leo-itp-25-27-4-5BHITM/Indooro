# Catalog bulk import status

## Current behavior

The admin catalog drawer accepts a JSON array or newline-delimited JSON and now
shows a row review before any request is made. It checks product IDs, names,
finite nonnegative prices, four-part numeric layout codes, category codes and
names, and duplicate IDs/codes in the submitted file. Invalid rows and their
reasons remain visible in the review. Parsing and review do not write data.

Commit is intentionally disabled. The current product endpoint,
`POST /api/products/bulk`, requires the `admin` role and validates every
product before sending one OpenSearch bulk request. However,
`OpenSearchService.indexProducts` only logs item-level failures from the
`BulkResponse`; `ProductResource` returns a success message based on the input
size regardless. OpenSearch bulk requests can partially succeed, so the
response does not prove that all rows were stored and there is no rollback.

The category endpoint, `POST /api/categories/bulk`, also requires `admin`.
`CategoryService` validates required fields before indexing, but
`CategoryRepository.bulkIndex` discards the returned `BulkResponse`. The route
then reports the input count. Duplicate codes in one file are not identified
by the backend, and indexing uses the code as the document ID, so repeated
codes overwrite one another. There is no preview/conflict endpoint or
transaction/rollback behavior for either catalog.

## Capability needed to enable commit

Add reviewed backend import semantics that return a result for each input row,
including saved, skipped/conflicted, and failed outcomes. Define duplicate
handling and whether updates are allowed. If all-or-nothing behavior is
required, implement it with storage that can guarantee rollback; an OpenSearch
bulk request alone does not provide that guarantee. Only then should the UI
submit the reviewed set and summarize persisted outcomes from the backend.

## Evidence

- Product validation and route response: `ProductResource.indexProducts`.
- Product partial-error handling: `OpenSearchService.indexProducts`.
- Category validation: `CategoryService.bulkInsert`.
- Category response handling: `CategoryResource.bulkInsert` and
  `CategoryRepository.bulkIndex`.
- Admin review and blocked commit: `META-INF/resources/admin/app.js`.
