## 1. Discovery

- [x] 1.1 Review every tracked backend, admin, customer web, infrastructure, and Swift source file and record findings in `docs/audit/CODE_AUDIT.md`.
- [x] 1.2 Write the full-stack system map in `docs/audit/SYSTEM_MAP.md`.
- [x] 1.3 Run `mvn -o test` in `backend/indooro_server` and record test count and JaCoCo coverage.
- [x] 1.4 Build the iOS app with `SWIFT_STRICT_CONCURRENCY=complete` and record the diagnostic count per file.

## 2. OpenSpec Artifacts

- [x] 2.1 Write `proposal.md` and `design.md` for `add-cross-platform-baseline-specs`.
- [x] 2.2 Write ADDED requirements for `admin-dashboard`.
- [x] 2.3 Write ADDED requirements for `swift-client`.
- [x] 2.4 Write ADDED requirements for `backend-core`.
- [x] 2.5 Write ADDED requirements for `shared-api`.

## 3. Shared Contract Artifact

- [x] 3.1 Write `openspec/specs/shared-api/openapi.yaml` covering every route in `backend/indooro_server/src/main/java/at/htl/resource`.

## 4. Verification And Archive

- [x] 4.1 Run `npx -y @fission-ai/openspec@1.3.1 validate add-cross-platform-baseline-specs --strict`.
- [x] 4.2 Archive the change with `npx -y @fission-ai/openspec@1.3.1 archive add-cross-platform-baseline-specs --yes`.
- [x] 4.3 Replace generated purpose placeholders in the four new permanent specs.
- [x] 4.4 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
