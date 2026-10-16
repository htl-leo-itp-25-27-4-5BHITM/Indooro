## 1. Setup

- [x] 1.1 Use existing `pilot/editor-underlay` at `origin/main` after the admin rebuild merge; the planning folder is already present. Baseline backend 142/142, Admin Unit 69/69, Browser 111/111, Typecheck, Lint and Package/Build passed.
- [x] 1.2 Validate the change with OpenSpec strict.

## 2. Backend

- [x] 2.1 Flyway migration for `layout_underlays` at V15 (next unallocated version across active changes).
- [x] 2.2 Entity, repository, service with magic-byte check, size and dimension limits, audit log.
- [x] 2.3 Resource `PUT/GET/DELETE /api/stores/{storeId}/layout/underlay` with roles and scope; `@QuarkusTest` for 200/401/403/413/415.
- [x] 2.4 Update `openspec/specs/shared-api/openapi.yaml`.

## 3. Admin Editor

- [x] 3.1 Upload control with client-side downscale to ≤ 4000 px and a PDF export hint.
- [x] 3.2 Underlay layer under the grid with opacity, rotation, offset, lock.
- [x] 3.3 Two-point calibration dialog; unit tests for scale and rotation math.
- [x] 3.4 Mocked browser tests: upload, calibrate, reload keeps alignment, reject wrong type.

## 4. Verification

- [x] 4.1 Local Quarkus/PostgreSQL check with a synthetic plan committed under `admin-ui/tests/fixtures/` (bytea round-trip, calibration and mobile exclusion).
- [x] 4.2 All checks green; PR #111 → `main`; report status to Erik (`STATUS.md` on `pilot/first-store` is maintained by Erik).
