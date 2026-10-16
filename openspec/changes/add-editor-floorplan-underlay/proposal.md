## Why

Drawing a real store in the layout editor from scratch is the slowest part of onboarding (`docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md`: 4–8 hours for a pilot area). Stores usually have a fire-escape plan, a store-fitting plan or at least a photo of one. If the editor can show such an image as a scaled background, shelves can be traced in minutes and measurements become checkable.

## What Changes

- New editor: upload a PNG/JPEG as underlay for the current layout draft. PDF pages can be exported as PNG/JPEG before upload; the editor provides this hint.
- Scale and align the underlay with two reference points and their real distance in meters; adjust opacity, rotation and offset; lock the underlay.
- Store the underlay per store (not per version) via a protected backend endpoint with size and type limits; the mobile API never exposes it.
- Underlay is visible only in the editor, never in the app.

## Capabilities

### New Capabilities

- `editor-floorplan-underlay`: upload, calibration and display of a floor plan image under the layout in the admin editor.

### Modified Capabilities

- None.

## Impact

- Owner: Erik (admin agent). Branch `pilot/editor-underlay` from `main` after `complete-admin-parity-evidence` decides whether the new editor becomes default; the underlay works in the new editor in any case (`/admin/next/editor/`).
- Backend: new protected routes `PUT/GET/DELETE /api/stores/{storeId}/layout/underlay` (roles with store scope), file stored in PostgreSQL `bytea` or the PVC, max 10 MB, PNG/JPEG only; Flyway migration.
- Admin UI: editor layer, calibration dialog, tests.
- Privacy/rights: plans can be confidential; access only for authorized admin roles, documented in `PILOT_CUT.md` successor docs.
