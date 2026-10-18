## Decisions

1. **Shared rules**: port the validation rules of `scripts/pilot-data/csv_to_ndjson.py` to TypeScript with the same test vectors (copied fixtures).
2. **Commit**: batches of 100; backend returns per-row status; an idempotency key prevents duplicates on retry; the UI shows created/updated/failed counts.
3. **Overwrite**: existing ids are listed before commit and need explicit confirmation.

## Implementation notes

Task 3.1 (backend). Deviations from the decisions above, kept short:

- Batch size: the UI keeps batches of 100 (task 3.2); the backend accepts up to 500 products per request on both `/api/products/bulk` and `/api/admin/products/bulk`, answering 400 above that. The legacy endpoint had no limit before.
- Shared logic lives in `ProductBulkService`; the legacy endpoint behaves as before apart from the new limit.
- `AuditLogService.logByAdmin` was missing on this branch and is added (same as main, d454101); `log(...)` still writes actor SYSTEM.
- Audit: one `BULK_IMPORT` entry per fresh 200 answer. Idempotent replays and 503 transport results are not audited (no new write happened, or the outcome is unknown).
- Idempotency: key + store code + SHA-256 of the canonical JSON of the products (re-serialized, so whitespace differences still replay). The cache is not scoped per user. Only 200 answers are stored, never 503.
- Idempotency is checked after the store-access check, so a foreign store never gets a replay or a 409.
- Two identical requests that are in flight at the same time are not de-duplicated; the cache only helps after the first answer. Doc ids (`<storeCode>:<id>`) keep the result free of duplicates in any case.
