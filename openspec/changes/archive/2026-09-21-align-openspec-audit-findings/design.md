## Context

The audit compared every file in `documentation/`, the current OpenSpec specs, and the implemented backend/iOS source. The current OpenSpec baseline validates cleanly and is generally closer to source than the older sprint documents, but several durable requirements are either stale, ambiguous, or too aspirational for the current code.

The change is intentionally a specification-alignment and small implementation cleanup change. It does not introduce a new subsystem. It tightens the existing contract around security boundaries, mobile layout fallback, current-user identity payloads, automatic mobile store detection, and store-aware catalog search.

## Goals / Non-Goals

**Goals:**

- Make category bulk import follow the same protected write boundary as product bulk import.
- Define the mobile current-layout fallback response so clients can tell persisted active layouts from generated/default layouts.
- Define the `/api/admin/me` response as the resolved Indooro access context, while keeping Keycloak roles available for backend agreement checks.
- Wire or document the iOS app's automatic beacon-to-store flow so backend store detection is actually consumed by the mobile client.
- Make store-scoped product search explicit before claiming multi-store product/location correctness.
- Treat older conflicting docs as historical inputs rather than current runtime truth.

**Non-Goals:**

- No full documentation rewrite.
- No new authentication architecture, Keycloak realm redesign, or policy-enforcer adoption.
- No production PDF ingestion implementation.
- No Android parity, analytics, live inventory, payment, or backend customer accounts.
- No removal of legacy layout endpoints in this change.

## Decisions

1. Protect category bulk import as admin maintenance.

   `POST /api/categories/bulk` mutates OpenSearch catalog state and should not remain public just because category reads are public. The route should require the same `admin` role and active Indooro assignment used by product writes.

   Alternative considered: leave category bulk public because the public route pattern already permits `/api/categories/*`. Rejected because the route is a write path and violates the current protected mutation model.

2. Preserve default-layout fallback, but make it explicit.

   The backend currently returns a default layout when a store has no active layout. This is acceptable for demos and mobile usability, but the response must be distinguishable from a persisted layout by returning a null layout id and fallback/default metadata.

   Alternative considered: change backend to return 404 for no active layout. Rejected for now because the current app already expects fallback behavior and a hard 404 would reduce demo resilience.

3. Treat `/api/admin/me` as the Indooro access context response.

   Backend authorization already compares Keycloak roles with the database assignment. The Admin UI primarily needs the resolved subject, username/email, Indooro role, and scope. Raw Keycloak roles may be exposed later, but the durable requirement should not claim they are already part of the payload unless implemented.

   Alternative considered: add raw Keycloak roles immediately. Deferred because it is not necessary for UI scope rendering and may expose more token detail than the UI needs.

4. Mobile automatic store detection is not complete until Swift consumes `/api/mobile/stores/by-beacon`.

   The backend can resolve a store by beacon, while the current Swift app has positioning/routing code and manual store loading but no visible caller for the beacon lookup route. This change should either wire the app to the route or clearly keep automatic switching out of scope. The requirement chooses wiring it because the current product goal depends on automatic store context.

   Alternative considered: document automatic store detection as future-only. Rejected because the backend route already exists and the MVP story expects beacon-based detection.

5. Store-aware product search needs explicit data and route behavior.

   Current product documents contain id, name, price, and layoutCode. That is enough for a one-store demo but not enough to claim multi-store correctness. This change should introduce optional store identity fields and a store filter path while preserving anonymous product search.

   Alternative considered: downgrade the requirement to future-only. Rejected because the project already has store selection/detection, so the search contract should move toward store-correct product locations.

## Risks / Trade-offs

- Category import clients may break after protection → Update HTTP smoke tests and operator docs with authenticated admin import examples.
- Existing demos may rely on fallback layouts without knowing it → Add explicit fallback markers in the mobile layout response and UI/debug messaging.
- Adding store scope to product documents may require reindexing sample product data → Keep store fields nullable and preserve store-agnostic search behavior when no store is selected.
- Swift automatic detection can select the wrong store if beacon identities are duplicated or incomplete → Use the backend conflict behavior and fall back to manual selection on ambiguous matches.
- Legacy docs may remain confusing → Add a project-overview requirement that newer OpenSpec/source verification wins when docs conflict.

## Migration Plan

1. Update OpenSpec deltas and validate the change.
2. Protect category bulk import in backend auth policy/resource code.
3. Add or clarify mobile layout fallback response metadata and client handling.
4. Adjust `/api/admin/me` spec or payload to match the chosen contract.
5. Add Swift beacon-to-store lookup and fallback to manual store selection.
6. Add store fields/filter behavior for product catalog data without breaking existing store-agnostic calls.
7. Update HTTP tests and any verification notes affected by auth or route behavior.

Rollback is straightforward: revert this change's implementation commits and archive nothing. Existing public read routes, admin auth, and legacy layout routes should remain untouched.

## Open Questions

- Should `/api/admin/me` expose raw Keycloak roles now, or is the resolved Indooro role sufficient for the Admin UI?
- Should store-scoped search use `storeId`, `storeCode`, or both in product documents and query parameters?
- Should fallback layouts include an explicit `source` field, or is `layoutId: null` plus status metadata enough?
