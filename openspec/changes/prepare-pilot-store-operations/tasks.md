## 1. Setup

- [ ] 1.1 Create or check out branch `pilot/store-operations` (tracks `origin/pilot/store-operations`, based on `pilot/first-store`); install Python 3.10+ and Node.js; confirm `npx -y @fission-ai/openspec@1.3.1 validate prepare-pilot-store-operations --strict` passes.
- [ ] 1.2 Read `docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md`, `06_BUSINESS_OUTREACH.md`, `openspec/specs/store-layout-management/spec.md`, `openspec/specs/product-catalog-search/spec.md` (layout code format) and `documentation/API_DOCUMENTATION.md` (bulk format).

## 2. Layout and Data Conventions

- [ ] 2.1 Write `docs/pilot-readiness/operations/LAYOUT_CONVENTIONS.md` per design decision 3, with one example shelf as JSON and a drawing (ASCII or image) of board/position counting.
- [ ] 2.2 Write `docs/pilot-readiness/operations/STORE_DATA_ENTRY.md`: measure the area, draw it in the admin editor, set labels, register and place beacons, activate the layout version, run the readiness report (`add-store-pilot-readiness-check`), check in the app. Use screenshots from the admin when available; otherwise placeholders with a note.
- [ ] 2.3 Add a section on real store data: `SparSupermarkt_Posttrasse` and `Belegplan_ocr.pdf` may be used only after task 5.2 confirms origin and permission.

## 3. Spreadsheet Import Tooling

- [ ] 3.1 Create `docs/pilot-readiness/kit/produkte-vorlage.csv` (header + 5 example rows, synthetic products) per design decision 1.
- [ ] 3.2 Implement `scripts/pilot-data/csv_to_ndjson.py` with all validations of the requirement „Product spreadsheets are converted and validated against the layout“; detect `;`/`,` and BOM; no partial output.
- [ ] 3.3 Add synthetic test fixtures under `scripts/pilot-data/fixtures/` (small layout JSON with 4 labeled shelves and 1 entrance; valid CSV; CSV with each error type; Excel-style CSV with BOM and umlauts).
- [ ] 3.4 Add `scripts/pilot-data/test_csv_to_ndjson.py` (unittest) covering all scenarios; run with `python -I -m unittest discover scripts/pilot-data` on Windows.
- [ ] 3.5 Add `scripts/pilot-data/README.md`: usage on Windows (PowerShell) and macOS, how to import the result (admin catalog import or `POST /api/products/bulk` with an admin session), and how to roll back (delete by id list).
- [ ] 3.6 After 5.2 confirms permission: convert `backend/indooro_server/regalplan_export.csv` (map its columns) against `app/launch_supermarkt/SparSupermarkt_Posttrasse_layout.json` and document row count and errors in `STORE_DATA_ENTRY.md`. Until then mark as waiting.

## 4. Pilot Kit

- [ ] 4.1 `docs/pilot-readiness/kit/one-pager.md` and `brief-an-markt.md` from `06_BUSINESS_OUTREACH.md` B, C, E (placeholders for names, school address only).
- [ ] 4.2 `pilotvereinbarung.md` (one page) from `05_PILOT_IMPLEMENTATION.md` section 8.
- [ ] 4.3 `einwilligung-testperson.md` and `einwilligung-testperson-minderjaehrig.md`: purpose, data (test id, times, answers, optional position recording on team device), storage duration, voluntary, withdrawal, contact.
- [ ] 4.4 `fragebogen.md`: 5 questions on a 1–5 scale plus 1 free text; must map to the criteria in `03_PILOT_READINESS.md` 6.3 (reuse intention, ease, trust in location, would ask staff less, overall).
- [ ] 4.5 `testprotokoll.md`: per task product, condition (with/without app), time, found yes/no, help needed, position corrections, notes; aligned with the export of `add-pilot-study-mode`.
- [ ] 4.6 `hinweisschild.md` (A4, large font) and `kontaktliste-vorlage.csv` (store, type, address, decision maker role, contact channel, status, next step, date — no personal phone numbers or e-mails).
- [ ] 4.7 Generate PDFs for 4.1–4.6 with a local tool (Word/LibreOffice/Pandoc) into `docs/pilot-readiness/kit/pdf/`; if no tool is available, record as human step.

## 5. Onboarding and Organization

- [ ] 5.1 Write `docs/pilot-readiness/operations/STORE_ONBOARDING_CHECKLIST.md` and `SESSION_RUN_SHEET.md` per requirement „Pilot sessions use a checklist and documented consent“ (with time plan for a 2–3 h session, roles of two team members, what to do on app failure).
- [ ] 5.2 Human step: clarify with the team which store `SparSupermarkt_Posttrasse` is, who has contact, whether it is a SPAR AG branch or an independent merchant, and with which permission the layout and Belegplan were obtained; record the answer in `docs/pilot-readiness/team/STATUS.md`.
- [ ] 5.3 Human step: fill the contact list with 8–12 stores in Leonding/Linz-Süd/Traun/Pasching/Ansfelden outside the repository; record only counts and status in `STATUS.md`.
- [ ] 5.4 Human step: agree with the supervising teachers on sender, budget, insurance and code rights; record decisions in `STATUS.md`.

## 6. Verification and Handover

- [ ] 6.1 Run `python -I -m unittest discover scripts/pilot-data` and `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 6.2 Open a pull request `pilot/store-operations` → `pilot/first-store`; update `docs/pilot-readiness/team/STATUS.md` (row „Person C“).
