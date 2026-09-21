## Why

The specification audit found several places where legacy documentation, current OpenSpec requirements, and the implemented source code disagree. This change aligns the durable OpenSpec contract with the intended current system behavior before more implementation work builds on stale assumptions.

## What Changes

- Require protected admin authorization for category bulk import so catalog write surfaces have a consistent security boundary.
- Clarify mobile current-layout fallback behavior when a store has no active layout, including how clients distinguish fallback/default layouts from persisted active layouts.
- Clarify the Admin Platform current-user payload as the resolved Indooro access context, and decide whether raw Keycloak roles are exposed or only used internally for role/assignment agreement.
- Complete the mobile store detection contract by distinguishing backend beacon lookup support from client-side iOS automatic store switching, then require the Swift app to consume the public beacon lookup route when automatic detection is enabled.
- Tighten the store-aware catalog requirement so multi-store search/location correctness is either implemented with explicit product store scope or documented as future-only behavior.
- Mark older documentation that conflicts with current source as historical context rather than current runtime truth.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `catalog-maintenance-operations`: category bulk import becomes a protected catalog maintenance write path.
- `store-layout-management`: mobile current-layout fallback semantics are clarified for stores without active layouts.
- `admin-authentication`: current-user response requirements are clarified around resolved Indooro role/scope and optional Keycloak role exposure.
- `mobile-store-detection`: iOS automatic store detection must call the public beacon lookup route before loading the detected store layout.
- `product-catalog-search`: store-aware product catalog behavior is clarified so product search can be scoped correctly when multiple stores exist.
- `project-overview`: legacy documentation conflicts are explicitly treated as historical context, with OpenSpec plus source verification as the current baseline.

## Impact

- Backend APIs: `/api/categories/bulk`, `/api/mobile/stores/{storeId}/layout/current`, `/api/admin/me`, product search and product document model where store scoping is added.
- iOS app: Swift store detection flow in `swift/indooro-/indooroApp`, especially beacon-to-store resolution before layout loading.
- Admin UI: current-user rendering may remain unchanged unless raw Keycloak roles are added to the response.
- Documentation/OpenSpec: older sprint docs and API docs remain useful source material but must not override current OpenSpec/source truth.
- Tests: HTTP smoke/RBAC tests and Quarkus tests need coverage for protected category import, layout fallback shape, current-user payload, and mobile beacon store detection.
