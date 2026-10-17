## 1. Complete The Evidence Inventory

- [ ] 1.1 Map every remaining Admin route action, API call, role/scope, and loading, empty, validation, conflict, error, success, and unsaved state to a reproducible fixture, test or live probe, and screenshot where visual state matters. Start from `docs/admin-rebuild/EDITOR_EVIDENCE_GAPS.md` and the route/action matrices.
- [ ] 1.2 Run same-fixture Legacy/Candidate Store and global Editor comparisons for the still-open Canvas, Beacon, Inspector, History, validation, Preview, import/export, and keyboard paths. Record exact behavior differences and the decision to fix or accept each one.

## 2. Verify Cutover Gates

- [ ] 2.1 Complete Admin, Region Manager, and Store Manager UI workflows with own and foreign scopes, direct links, denied API mutations, Draft/Publish/version restore, empty/error recovery, and keyboard/accessibility checks; preserve or clean up fixtures.
- [ ] 2.2 Verify anonymous mobile/customer contracts after Editor publication and a physical Beacon/device route when hardware is available. Keep simulator and API evidence clearly separate from a device result.
- [ ] 2.3 Only after the Editor evidence passes, test the actual Editor route flag switch, query/fragment and refresh, plus rollback to Legacy. Keep the flag off if any gate fails.

## 3. Close The Evidence Change

- [x] 3.1 Update `docs/admin-rebuild/` matrices and OpenSpec task references using only observed results; run the relevant frontend/backend/live and strict OpenSpec checks. The timeboxed partial result and remaining gates are recorded in `docs/admin-rebuild/ADMIN_PARITY_TIMEBOX.md`.
- [ ] 3.2 Verify all requirements and scenarios for this evidence change and archive it through the normal OpenSpec workflow when complete.
