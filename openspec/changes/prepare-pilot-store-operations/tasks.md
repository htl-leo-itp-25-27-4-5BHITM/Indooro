## 1. Setup

- [ ] 1.1 Create branch `pilot/store-operations` from `origin/pilot/first-store` in its own worktree.
- [ ] 1.2 Read `docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md`, `06_BUSINESS_OUTREACH.md`, `harden-platform-security-baseline/{design,tasks}.md`, `protect-legacy-write-endpoints/{design,tasks}.md` and `DEPLOYMENT.md`.
- [ ] 1.3 Run `npx -y @fission-ai/openspec@1.3.1 validate prepare-pilot-store-operations --strict`.

## 2. Layout and Data Conventions (phase 1)

- [ ] 2.1 Write `docs/pilot-readiness/operations/LAYOUT_CONVENTIONS.md` per design decision 3, with one example shelf and its JSON.
- [ ] 2.2 Write `docs/pilot-readiness/operations/STORE_DATA_ENTRY.md`: how to measure the area, draw it in the admin editor (with screenshots from the current admin), set labels, register and place beacons, activate the layout version, and check it in the app.
- [ ] 2.3 Note in `docs/pilot-readiness/operations/LAYOUT_CONVENTIONS.md` that the existing `SparSupermarkt_Posttrasse` layout and `Belegplan_ocr.pdf` may be used only after the team confirms origin and permission (task 6.2).

## 3. Spreadsheet Import Tooling (phase 1)

- [ ] 3.1 Create `docs/pilot-readiness/kit/produkte-vorlage.csv` (header + 5 example rows) per design decision 1.
- [ ] 3.2 Implement `scripts/pilot-data/csv_to_ndjson.py` (standard library only) with validation against a layout JSON (shelf exists for kategorie+meter, label present, unique ids, numeric fach/reihe, non-empty name); no partial output on errors.
- [ ] 3.3 Add `scripts/pilot-data/test_csv_to_ndjson.py` (unittest) covering the scenarios of the requirement „Product spreadsheets are converted and validated against the layout“; run with `python3 -I -m unittest discover scripts/pilot-data`.
- [ ] 3.4 Convert `backend/indooro_server/regalplan_export.csv` as a sample (map its columns) against `app/launch_supermarkt/SparSupermarkt_Posttrasse_layout.json` and document the result (row count, errors) in `docs/pilot-readiness/operations/STORE_DATA_ENTRY.md`.
- [ ] 3.5 Document the import path (admin catalog import or `POST /api/products/bulk` with an admin token) and a rollback (delete by id list).

## 4. Backup, Restore, Smoke Check (phase 1)

- [ ] 4.1 Add `scripts/ops/backup-postgres.sh`, `scripts/ops/export-products.sh`, `scripts/ops/restore-postgres.sh` per design decision 4; add `backups/` to `.gitignore`.
- [ ] 4.2 Rehearse a restore locally (docker Postgres + backend dev mode) from a dump; record date, commands and result in `docs/pilot-readiness/operations/BACKUP_RESTORE.md`. Human step for the LeoCloud dump: person with cluster access.
- [ ] 4.3 Add `scripts/ops/pilot-smoke.sh <base-url> <storeId> <sample-query>` per requirement „Mobile pilot endpoints have a smoke check“ (curl + `python3 -I` or `jq` for counts).

## 5. Infrastructure Secrets and Exposure (phase 1, implements harden-platform-security-baseline 5.1, 5.2, 5.5)

- [ ] 5.1 Change `opensearch` and `dashboards` services in `k8s/opensearch.yaml` to `ClusterIP`, set dashboards replicas to 0; add `k8s/network-policy.yaml` only if `harden-platform-security-baseline` 1.3 confirms enforcement (otherwise note it as open).
- [ ] 5.2 Replace literal passwords in `k8s/postgres.yaml`, `k8s/backend.yaml`, `k8s/keycloak.yaml` with `secretKeyRef`; add `k8s/secrets.example.yaml` with names and placeholder values only.
- [ ] 5.3 Replace literal passwords in `docker-compose.yml` with `${VAR}` and a gitignored `.env` plus committed `.env.example`; remove real values from `DEPLOYMENT.md`.
- [ ] 5.4 Delete the unreferenced `k8s/volume-claim.yaml`.
- [ ] 5.5 Write `docs/pilot-readiness/operations/SECRET_ROTATION.md`: order of steps (backup first), `kubectl create secret` commands without values, rollout and verification; hand it to the person with LeoCloud access (human step) and record the date of rotation.
- [ ] 5.6 Mark `harden-platform-security-baseline` 5.1, 5.2, 5.5 with „(implemented in prepare-pilot-store-operations)“; leave 8.2 for phase 2 verification.

## 6. Pilot Kit and Organization (phase 1)

- [ ] 6.1 Create `docs/pilot-readiness/kit/` with Markdown sources and generated PDFs: `one-pager`, `brief-an-markt`, `pilotvereinbarung`, `einwilligung-testperson` (incl. variant with parental consent), `fragebogen` (5 scale questions + 1 free text), `hinweisschild` (A4), `testprotokoll` (per task: product, time with/without app, help needed, position corrections).
- [ ] 6.2 Human step: clarify with the team which store `SparSupermarkt_Posttrasse` is, who has contact, whether it is a SPAR AG branch or an independent merchant, and with which permission the layout and Belegplan were obtained; record the answer in `docs/pilot-readiness/team/STATUS.md`.
- [ ] 6.3 Create `docs/pilot-readiness/kit/kontaktliste-vorlage.csv` (store, type, address, decision maker role, contact channel, status, next step, date) and fill it (human) with 8–12 stores in Leonding/Linz-Süd/Traun/Pasching/Ansfelden; no private phone numbers or e-mails of persons in git (keep the filled list outside the repository).
- [ ] 6.4 Write `docs/pilot-readiness/operations/STORE_ONBOARDING_CHECKLIST.md` and `SESSION_RUN_SHEET.md` per requirement „Pilot sessions use a checklist and documented consent“.
- [ ] 6.5 Human step: agree with the supervising teachers on sender, budget, insurance and code rights; record decisions in `docs/pilot-readiness/team/STATUS.md`.

## 7. Backend Hardening (phase 2, only after codex/admin-platform-rebuild is merged into main)

- [ ] 7.1 Confirm the admin rebuild merge on `origin/main` (record the commit); create branch `pilot/backend-hardening` from `origin/main`.
- [ ] 7.2 Implement `protect-legacy-write-endpoints` sections 1–6 in that change's own task list; keep its tasks as the source of truth.
- [ ] 7.3 Implement `fix-ios-contract-and-spec-drift` 2.1–2.4 (dismissal bound) and mark them there.
- [ ] 7.4 Change the CI workflow to run `./mvnw test` instead of `-DskipTests`; keep build time under 10 minutes or document why not.
- [ ] 7.5 Human step with cluster access: roll out manifests and backend, rotate Keycloak and database secrets per `SECRET_ROTATION.md`; verify `harden-platform-security-baseline` 8.2 (OpenSearch unreachable from outside) and mark it.
- [ ] 7.6 Open a pull request `pilot/backend-hardening` → `main`; after merge, Erik merges `main` into `pilot/first-store`.

## 8. Verification and Handover

- [ ] 8.1 Run `python3 -I -m unittest discover scripts/pilot-data`, `bash -n` on all scripts, `./mvnw test` (phase 2), and `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 8.2 Open a pull request `pilot/store-operations` → `pilot/first-store` after sections 2–6; update `docs/pilot-readiness/team/STATUS.md` (row „Person C“).
