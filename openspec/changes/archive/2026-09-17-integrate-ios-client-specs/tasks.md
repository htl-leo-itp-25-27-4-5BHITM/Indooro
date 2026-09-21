## 1. Discovery

- [x] 1.1 Inventory all three Swift trees, their schemes, bundle identifiers, deployment targets, and file counts.
- [x] 1.2 Read every Swift source file of `swift/indooro-EinkaeuferFinal/indooroApp` and record responsibilities, state ownership, persistence keys, and network calls.
- [x] 1.3 Compare every consumed backend route with the backend DTOs in `backend/indooro_server/src/main/java/at/htl/admin/dto` and `at/htl/model`.
- [x] 1.4 Record spec drift and contract defects in `design.md` and `docs/specs/AUDIT.md`.

## 2. OpenSpec Artifacts

- [x] 2.1 Write `proposal.md` with new and modified capability names.
- [x] 2.2 Write ADDED requirements for `ios-client-architecture`, `ios-backend-integration`, `ios-product-planning`, `ios-store-map-experience`, and `ios-recipe-experience`.
- [x] 2.3 Write ADDED requirements for `mobile-store-detection`, `mobile-shopping-lists`, and `mobile-ar-navigation` using names that no active change uses.
- [x] 2.4 Write the MODIFIED platform-scope requirement and ADDED pipeline requirements for `mobile-positioning-navigation`.
- [x] 2.5 Update `openspec/config.yaml` so the canonical Swift tree is `swift/indooro-EinkaeuferFinal/indooroApp`.

## 3. Documentation

- [x] 3.1 Write `docs/specs/AUDIT.md` with inventory, contract comparison, and findings.

## 4. Verification And Archive

- [x] 4.1 Run `npx -y @fission-ai/openspec@1.3.1 validate integrate-ios-client-specs --strict`.
- [x] 4.2 Archive the change with `npx -y @fission-ai/openspec@1.3.1 archive integrate-ios-client-specs --yes`.
- [x] 4.3 Replace generated purpose placeholders in the new permanent specs.
- [x] 4.4 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
