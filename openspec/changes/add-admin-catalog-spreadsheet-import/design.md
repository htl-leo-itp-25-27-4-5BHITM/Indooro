## Decisions

1. **Shared rules**: port the validation rules of `scripts/pilot-data/csv_to_ndjson.py` to TypeScript with the same test vectors (copied fixtures).
2. **Commit**: batches of 100; backend returns per-row status; an idempotency key prevents duplicates on retry; the UI shows created/updated/failed counts.
3. **Overwrite**: existing ids are listed before commit and need explicit confirmation.
