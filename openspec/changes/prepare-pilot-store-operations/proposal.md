## Why

A real store can only be set up for a pilot if its data can be entered quickly and checked before customers see it, and if the organizational material exists (agreement, consent, questionnaire, one-pager, checklists). The pilot audit (`docs/pilot-readiness/01_PROJECT_AUDIT.md` 3.2, `05_PILOT_IMPLEMENTATION.md`) found:

- Products can only be imported as JSON array/NDJSON or a fixed „Belegplan“ PDF format; there is no spreadsheet path and no check that each `layoutCode` matches a shelf of the store layout.
- The grid unit (1 cell = 1 m) and a customer-readable shelf label convention are undocumented, although `add-pilot-guided-tour-fallbacks` now shows shelf labels to customers.
- Consent form, questionnaire, pilot agreement, print-ready outreach material, store onboarding checklist and session run sheet do not exist yet (texts drafted in `docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md` and `06_BUSINESS_OUTREACH.md`).
- The repository contains a layout `SparSupermarkt_Posttrasse` and a scanned „Belegplan“ with SPAR private labels whose origin and permission are undocumented.

Backend operations (backup, secrets, OpenSearch exposure, smoke check, release) are handled in `release-pilot-backend`.

## What Changes

- Document layout and data conventions for pilot stores (grid unit, entrance, shelf label format, board and position counting, layoutCode composition).
- Add a spreadsheet template and a cross-platform converter (Python standard library) that turns a CSV export into bulk NDJSON and validates every row against the store layout JSON.
- Document the store data entry workflow in the admin platform step by step.
- Produce the pilot kit: one-pager, letter, one-page pilot agreement, consent form (adult and parental variant), questionnaire, notice sign, test protocol, contact tracker template, store onboarding checklist and session run sheet.

## Capabilities

### New Capabilities

- `pilot-store-operations`: data conventions, spreadsheet import with validation, store onboarding checklist and consent rules.

### Modified Capabilities

- None.

## Impact

- Owner: Person C „Feld, Daten & Pilot-Kit“ (Windows), branch `pilot/store-operations` from `pilot/first-store`.
- Files: `docs/pilot-readiness/operations/` (new), `docs/pilot-readiness/kit/` (new), `scripts/pilot-data/` (new). No application code, no backend, no infrastructure.
- Works on Windows: Python 3, Node.js (for `npx` OpenSpec), Git. No Mac required.
- Privacy: no personal data of real persons in the repository; filled contact lists and signed forms stay outside git.
