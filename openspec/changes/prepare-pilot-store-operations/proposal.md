## Why

A real store can only be set up and operated for a pilot if data entry is fast and checkable, the backend is not openly writable, data can be restored, and the organizational material (consent, agreement, one-pager) exists. The pilot audit (`docs/pilot-readiness/01_PROJECT_AUDIT.md` 3.2–3.3, `05_PILOT_IMPLEMENTATION.md`) found:

- Products can only be imported as JSON array/NDJSON or a fixed „Belegplan“ PDF format; there is no spreadsheet path and no check that each `layoutCode` matches a shelf in the store layout.
- The grid unit (1 cell = 1 m) and a customer-readable shelf label convention are undocumented, although `add-pilot-guided-tour-fallbacks` now shows shelf labels to customers.
- OpenSearch runs with the security plugin disabled and is exposed as `NodePort` (`k8s/opensearch.yaml:26,51,76`); passwords and a client secret are committed in plain text (`k8s/*.yaml`, `keycloak/realm/indooro-realm.json`, `DEPLOYMENT.md`, `docker-compose.yml`, `application.properties` defaults).
- There is no PostgreSQL backup; layouts and beacon assignments exist only in one database instance.
- `POST /api/convert/pdf-to-json` and `POST /api/export/pdf` are anonymous (planned fix in the open change `protect-legacy-write-endpoints`).
- Consent form, questionnaire, pilot agreement and print-ready outreach material do not exist yet (texts drafted in `docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md` and `06_BUSINESS_OUTREACH.md`).

`codex/admin-platform-rebuild` is still being finished by another agent and modifies `application.properties`, `keycloak/realm/indooro-realm.json` and 66 backend source files. Backend source and Keycloak realm changes therefore wait until that branch is merged into `main`.

## What Changes

Phase 1 (now, no backend Java or Keycloak realm edits):

- Document layout and data conventions for pilot stores (grid unit, entrance, shelf label format, board counting, layoutCode composition).
- Add a spreadsheet template and a converter that turns a CSV export into bulk NDJSON and validates every row against the store layout JSON (shelf exists, label present, no duplicates).
- Add backup and restore scripts for PostgreSQL and a product export for OpenSearch, and rehearse a restore locally.
- Move committed secrets in `k8s/` manifests, `docker-compose.yml` and `DEPLOYMENT.md` to Kubernetes secrets / `.env` references and change OpenSearch and Dashboards services to `ClusterIP` (implements `harden-platform-security-baseline` 5.1, 5.2, 5.5); prepare rotation instructions for the person with LeoCloud access.
- Add a pilot smoke check script for the mobile endpoints used by the app.
- Produce the pilot kit: print-ready one-pager and letter, consent form, questionnaire, one-page pilot agreement, contact tracker, store onboarding checklist and run sheet.

Phase 2 (after `codex/admin-platform-rebuild` is on `main`, branch from `main`):

- Implement `protect-legacy-write-endpoints` completely.
- Implement `fix-ios-contract-and-spec-drift` section 2 (upsell dismissal bound, backend part).
- Remove secret defaults from `application.properties` for `%prod` and the Keycloak realm demo credentials as specified in those changes; rotate secrets on LeoCloud (human with cluster access) and verify `harden-platform-security-baseline` 8.2.
- Let CI run the backend tests instead of `-DskipTests`.

## Capabilities

### New Capabilities

- `pilot-store-operations`: data conventions, spreadsheet import with validation, store onboarding checklist, consent and pilot documents, smoke check.

### Modified Capabilities

- `deployment-operations`: database backup and restore with rehearsal before each pilot session.

## Impact

- Owner: Person C „Daten, Betrieb & Pilotkoordination“; branches `pilot/store-operations` (phase 1, from `pilot/first-store`) and `pilot/backend-hardening` (phase 2, from `main` after the admin merge).
- Files phase 1: `docs/pilot-readiness/operations/` (new), `docs/pilot-readiness/kit/` (new), `scripts/pilot-data/` (new), `scripts/ops/` (new), `k8s/opensearch.yaml`, `k8s/postgres.yaml`, `k8s/backend.yaml`, `k8s/keycloak.yaml` (secret references only), `k8s/volume-claim.yaml` (delete), `docker-compose.yml`, `DEPLOYMENT.md`.
- Files phase 2: backend sources and resources per `protect-legacy-write-endpoints`, `.github/workflows/*`.
- LeoCloud rollout and secret rotation require cluster access (namespace `student-it220209`); the owner documents commands, a person with access executes them.
- Privacy: consent form and data handling rules for test persons; no customer data on the backend.
