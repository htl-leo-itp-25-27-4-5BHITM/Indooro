## Context

- Products live in OpenSearch index `products` (`id`, `name`, `price`, `layoutCode`, optional `storeId`/`storeCode`); bulk import via `POST /api/products/bulk` (admin role) or the admin UI catalog import (`admin-ui/src/.../CatalogImport.tsx` on the admin branch, JSON array or NDJSON). `demoproducts.ndjson` uses bulk pairs.
- `layoutCode` = `category/meter/fach/reihe`; shelf elements carry `category`, `meter`, `label` (editor field „Bezeichnung“), `layoutCode` and `productPositions` (editor on the admin branch).
- Layout grid units are undocumented; the iOS solver compares beacon distances in meters directly with grid coordinates, so 1 cell = 1 m is required.
- Existing regal exports: `backend/indooro_server/regalplan_export.csv` (`Produktname;Regalcode;Kategorie;Meter;Pos`).
- `harden-platform-security-baseline` tasks 1.1, 1.2, 5.1, 5.2, 5.5, 8.2 and all of `protect-legacy-write-endpoints` are relevant for the pilot; other tasks of those changes are not pilot blockers.
- `codex/admin-platform-rebuild` (in progress, 34/39 tasks of `rebuild-admin-platform`) touches `application.properties` and `keycloak/realm/indooro-realm.json`; `k8s/` is untouched by it.

## Goals / Non-Goals

Goals: one person can set up 100–200 products for a pilot area in under two hours; the backend is not writable from outside; a lost database can be restored; all paper documents for the pilot exist.

Non-goals: ERP/POS integration, product images, CSV import inside the admin UI (a script is enough for one store), Keycloak production redesign beyond what `protect-legacy-write-endpoints` and the selected `harden-platform-security-baseline` tasks require, multi-store tooling.

## Decisions

1. **Spreadsheet format.** `docs/pilot-readiness/kit/produkte-vorlage.csv`, semicolon-separated, UTF-8, columns `id;name;marke;menge;regal_label;kategorie;meter;fach;reihe;preis`. `layoutCode` is generated as `kategorie/meter/fach/reihe`. `name` sent to the backend = `marke name menge` trimmed. `id` must be unique per store; if empty, the converter assigns ids from a configurable start value.
2. **Converter.** `scripts/pilot-data/csv_to_ndjson.py` (Python 3 standard library only, run with `python3 -I`), arguments: CSV path, layout JSON path, store id/code, output path. Validation errors are printed per row and make the exit code non-zero; output is bulk NDJSON compatible with `POST /api/products/bulk` and the admin catalog import. Unit tests with `python3 -I -m unittest`.
3. **Layout conventions.** `docs/pilot-readiness/operations/LAYOUT_CONVENTIONS.md`: 1 cell = 1 m; exactly one `entrance`; every shelf has `category`, `meter` and `label` in the format „Gang <n> · <links|rechts> · <Warengruppe>“; boards (`fach`) counted from the floor starting at 1; positions (`reihe`) counted from the left when facing the shelf.
4. **Backup.** `scripts/ops/backup-postgres.sh` runs `kubectl -n student-it220209 exec <postgres-pod> -- pg_dump -Fc` and stores `backups/<date>-indooro.dump` locally (gitignored); `scripts/ops/export-products.sh` stores all products as NDJSON. `restore-postgres.sh` restores into a local docker Postgres for the rehearsal. Backups never go into git.
5. **Secrets.** Manifests reference `secretKeyRef` only; a `k8s/secrets.example.yaml` documents names without values; `DEPLOYMENT.md` explains creation with `kubectl create secret generic … --from-literal` without real values. Rotation is a human step by the person with cluster access. Git history still contains old values; therefore rotation is mandatory, not optional.
6. **Phase split.** Phase 1 never edits `backend/indooro_server/src/**` or `keycloak/realm/**`. Phase 2 starts only after `codex/admin-platform-rebuild` is merged into `main` (check `git log origin/main`).
7. **Documents.** Kit documents are Markdown sources plus print-ready PDFs generated locally (any tool); text from `docs/pilot-readiness/05` and `06` is the source; no personal data of real persons in the repository.

## Risks / Trade-offs

- Script-based import requires a developer; acceptable for one pilot store.
- Rotating secrets can lock out the live admin if done in the wrong order; follow `harden-platform-security-baseline` design order and take a backup first.

## Migration / Rollback

Manifest changes are reversible with `kubectl apply` of the previous version; take a backup before any rollout.
