## 1. Backend Security And API Contract

- [x] 1.1 Protect `POST /api/categories/bulk` with admin role authorization and active Indooro admin assignment checks.
- [x] 1.2 Keep category list and category-by-code reads public after protecting category bulk import.
- [x] 1.3 Add or update backend tests or HTTP checks proving anonymous and non-admin category bulk import is rejected.
- [x] 1.4 Verify existing product write protection still passes after any auth-policy changes.

## 2. Mobile Layout Fallback Contract

- [x] 2.1 Review the mobile current-layout response DTO and document how fallback/default layouts are represented.
- [x] 2.2 Add explicit fallback/default metadata when a store has no active persisted layout, or confirm `layoutId: null` is the chosen contract.
- [x] 2.3 Update Swift layout loading UI/debug text to distinguish fallback/default layout responses from persisted active layouts.
- [x] 2.4 Add a manual or automated check for `/api/mobile/stores/{storeId}/layout/current` when no active layout exists.

## 3. Admin Current User Payload

- [x] 3.1 Decide whether `/api/admin/me` exposes only resolved Indooro role/scope or also raw Keycloak roles.
- [x] 3.2 Update `AdminUserDtos.CurrentUserResponse`, `AdminAccessService`, or the spec text so the API response and OpenSpec contract match exactly.
- [x] 3.3 Verify the Admin UI still renders username, email or fallback identifier, role, and scope correctly.
- [x] 3.4 Add or update an auth verification check for `/api/admin/me` covering admin, region-manager, store-manager, role mismatch, and missing assignment.

## 4. iOS Beacon Store Detection

- [x] 4.1 Add a Swift API model for `/api/mobile/stores/by-beacon` responses, including matched store and beacon details.
- [x] 4.2 Add a Swift request path that calls `/api/mobile/stores/by-beacon` with detected UUID and optional major/minor values when automatic store detection is enabled.
- [x] 4.3 Load the detected store's `/api/mobile/stores/{storeId}/layout/current` response after a successful backend match.
- [x] 4.4 Preserve manual store selection when Bluetooth, ranging, network, or backend beacon lookup is unavailable.
- [x] 4.5 Handle backend 404/409 responses without switching to a guessed store.

## 5. Store-Aware Product Search

- [x] 5.1 Decide the product store scope fields for OpenSearch documents, such as `storeId`, `storeCode`, or both.
- [x] 5.2 Extend the product model, indexing, and mapping so store-scoped product documents can be represented without breaking existing store-agnostic data.
- [x] 5.3 Add a public search query parameter for selected/detected store scope when the client has a store context.
- [x] 5.4 Keep anonymous store-agnostic product search working when no store is selected.
- [x] 5.5 Update demo data or import examples so at least one product can be verified with store scope.

## 6. Documentation And OpenSpec Hygiene

- [x] 6.1 Mark older sprint/API documentation conflicts as historical notes or update them to point readers at current OpenSpec and source verification.
- [x] 6.2 Update `documentation/KEYCLOAK_AUTH_VERIFICATION.md` or `api-tests/httpyac` checks for changed auth boundaries.
- [x] 6.3 Ensure no documentation claims automatic iOS store detection is complete unless the Swift route call is implemented.
- [x] 6.4 Keep the test-room PDF documented as supporting calibration context, not as a replacement for layout JSON.

## 7. Verification

- [x] 7.1 Run `openspec validate align-openspec-audit-findings --strict`.
- [x] 7.2 Run `openspec validate --specs --strict`.
- [x] 7.3 Run backend tests with `sh mvnw test -Dnet.bytebuddy.experimental=true`.
- [x] 7.4 Run or document the relevant HTTP auth/public-route checks from `api-tests/httpyac`.
- [x] 7.5 Build or manually verify the Swift app paths touched by beacon store detection and layout fallback handling.
