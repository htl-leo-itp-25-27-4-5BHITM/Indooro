## Context

- Products live in OpenSearch index `products` (`id`, `name`, `price`, `layoutCode`, optional `storeId`/`storeCode`); bulk import via `POST /api/products/bulk` (admin role) or the admin catalog import of the rebuilt admin (JSON array or NDJSON). `demoproducts.ndjson` uses bulk pairs.
- `layoutCode` = `category/meter/fach/reihe`; shelf elements carry `category`, `meter`, `label` (editor field „Bezeichnung“), `layoutCode` and `productPositions`.
- Layout grid units are undocumented; the iOS solver compares beacon distances in meters directly with grid coordinates, so 1 cell = 1 m is required (`store-layout-management`: „Layout grid and scale are explicit“ asks for exactly this documentation).
- Existing regal export: `backend/indooro_server/regalplan_export.csv` (`Produktname;Regalcode;Kategorie;Meter;Pos`).

## Goals / Non-Goals

Goals: one person can prepare 100–200 products for a pilot area in under two hours with errors found before import; all paper documents exist; conventions are explicit.

Non-goals: ERP/POS integration, product images, CSV import inside the admin UI, backend changes, deployment.

## Decisions

1. **Spreadsheet format.** `docs/pilot-readiness/kit/produkte-vorlage.csv`, semicolon-separated, UTF-8 with BOM accepted (Excel on Windows), columns `id;name;marke;menge;regal_label;kategorie;meter;fach;reihe;preis`. `layoutCode` = `kategorie/meter/fach/reihe`. Product `name` = `marke name menge` trimmed. `id` unique; if empty, the converter assigns ids from a configurable start value.
2. **Converter.** `scripts/pilot-data/csv_to_ndjson.py` (Python 3.10+, standard library only, run with `python -I` on Windows or `python3 -I` elsewhere). Arguments: CSV path, layout JSON path, `--store-id`, `--store-code`, `--out`. Validation errors per row; non-zero exit code; no partial output file. Output: bulk NDJSON compatible with `POST /api/products/bulk` and the admin catalog import, plus a summary (rows, shelves used, shelves without products).
3. **Layout conventions.** `docs/pilot-readiness/operations/LAYOUT_CONVENTIONS.md`: 1 cell = 1 m; exactly one `entrance`; every target shelf has `category`, `meter`, `label` in the format „Gang <n> · <links|rechts> · <Warengruppe>“; `fach` counted from the floor starting at 1; `reihe` counted from the left when facing the shelf.
4. **Documents.** Markdown sources in `docs/pilot-readiness/kit/`; PDFs generated with any local tool (Word, LibreOffice, Pandoc) and committed only if they contain no personal data. Texts from `docs/pilot-readiness/05` and `06` are the source.
5. **Real store data.** The `SparSupermarkt_Posttrasse` layout and `Belegplan_ocr.pdf` may serve as examples only after the team confirms origin and permission; until then tests use synthetic data.

## Risks / Trade-offs

- Script-based import requires a developer; acceptable for one pilot store. A UI import is a post-pilot topic.
- Excel may change separators or encodings; the converter accepts `;` and `,` and UTF-8 with/without BOM and reports which it detected.

## Migration / Rollback

Additive files only.
