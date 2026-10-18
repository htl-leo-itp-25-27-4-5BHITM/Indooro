## 1. Complete The Evidence Inventory

- [x] 1.1 Map every remaining Admin route action, API call, role/scope, and loading, empty, validation, conflict, error, success, and unsaved state to a reproducible fixture, test or live probe, and screenshot where visual state matters. Start from `docs/admin-rebuild/EDITOR_EVIDENCE_GAPS.md` and the route/action matrices.
- [x] 1.2 (closed 2026-10-17 by automated Candidate specs plus a test-enforced Legacy control map, see `docs/admin-rebuild/EDITOR_P0_CLOSURE.md`; earlier same-fixture live probes remain) Run same-fixture Legacy/Candidate Store and global Editor comparisons for the still-open Canvas, Beacon, Inspector, History, validation, Preview, import/export, and keyboard paths. Record exact behavior differences and the decision to fix or accept each one.

## 2. Verify Cutover Gates

- [x] 2.1 (closed 2026-10-17 with mocked-API Playwright for all three roles and backend role/scope tests; no new live fixtures were created) Complete Admin, Region Manager, and Store Manager UI workflows with own and foreign scopes, direct links, denied API mutations, Draft/Publish/version restore, empty/error recovery, and keyboard/accessibility checks; preserve or clean up fixtures.
- [ ] 2.2 (Mensch: physisches Gerät/Beacon; lokale API- und Simulatorbelege ersetzen diesen Nachweis nicht) Verify anonymous mobile/customer contracts after Editor publication and a physical Beacon/device route when hardware is available. Keep simulator and API evidence clearly separate from a device result.
- [x] 2.3 (lokaler paketierter Stack, 2026-10-18; Protokoll und Screenshots: `docs/admin-rebuild/EDITOR_CUTOVER_2026-10-18.md`) Only after the Editor evidence passes, test the actual Editor route flag switch, query/fragment and refresh, plus rollback to Legacy. Keep the flag off if any gate fails.

## 3. Close The Evidence Change

- [x] 3.1 Update `docs/admin-rebuild/` matrices and OpenSpec task references using only observed results; run the relevant frontend/backend/live and strict OpenSpec checks. The timeboxed partial result and remaining gates are recorded in `docs/admin-rebuild/ADMIN_PARITY_TIMEBOX.md`.
- [ ] 3.2 (Mensch: Erik muss die Archivierung freigeben; Task 2.2 benötigt Gerät/Beacon) Verify all requirements and scenarios for this evidence change and archive it through the normal OpenSpec workflow when complete.
