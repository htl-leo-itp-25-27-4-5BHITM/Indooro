## 1. Setup

- [x] 1.1 Use existing `pilot/editor-underlay` at `origin/main` after the admin rebuild merge; the planning folder is already present. Baseline backend 142/142, Admin Unit 69/69, Browser 111/111, Typecheck, Lint and Package/Build passed.
- [x] 1.2 Validate the change with OpenSpec strict.

## 2. Backend

- [x] 2.1 Flyway migration for `layout_underlays` at V15 (next unallocated version across active changes).
- [ ] 2.2 Entity, repository, service with magic-byte check, size and dimension limits, audit log.
- [ ] 2.3 Resource `PUT/GET/DELETE /api/stores/{storeId}/layout/underlay` with roles and scope; `@QuarkusTest` for 200/401/403/413/415.
- [ ] 2.4 Update `openspec/specs/shared-api/openapi.yaml`.

## 3. Admin Editor

- [ ] 3.1 Upload dialog with client-side downscale to ≤ 4000 px.
- [ ] 3.2 Underlay layer under the grid with opacity, rotation, offset, lock.
- [ ] 3.3 Two-point calibration dialog; unit tests for scale and rotation math.
- [ ] 3.4 Mocked browser tests: upload, calibrate, reload keeps alignment, reject wrong type.

## 4. Verification

- [ ] 4.1 Local stack check with a sample plan (synthetic image, committed under `admin-ui/tests/fixtures/`).
- [ ] 4.2 All checks green; pull request → `main`; update `STATUS.md`.
