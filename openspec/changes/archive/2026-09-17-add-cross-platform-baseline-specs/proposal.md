## Why

The full-stack audit of 2026-09-17 (`docs/audit/SYSTEM_MAP.md`, `docs/audit/CODE_AUDIT.md`) found that OpenSpec describes the admin workflows, the iOS client, and the backend only as feature slices. There is no capability that states the cross-cutting contract of each subsystem: which admin tables, filters, and bulk actions exist; which native platform features the iOS client uses and deliberately does not use; how the backend is layered, persisted, secured, and audited; and which HTTP contract the three clients share. Without these baselines, every follow-up change (security hardening, admin contract fixes, data-access optimization, shared API contract) has no stable anchor to add requirements to.

This change records the verified current behavior as four single-source-of-truth capabilities so the follow-up changes can extend them.

## What Changes

- Add `admin-dashboard` with the static admin application structure, role-aware navigation, session bootstrap, overview metrics, the data-table catalog with filters and sorting, confirmation of destructive actions, bulk actions, client-side form validation, recipe workflows, the layout editor modes, and the diagnostics page.
- Add `swift-client` with the capability map of the iOS client, the native platform feature inventory, local-only data ownership, the explicit absence of push notifications and server sync, anonymous transport rules, and the concurrency governance baseline.
- Add `backend-core` with the modular-monolith structure, the PostgreSQL/OpenSearch persistence split, Flyway-only schema evolution, the hybrid OIDC authentication model, centralized scope decisions, transactional and audited mutations, record lifecycles, error mapping, catalog/recipe/upsell data pipelines, optional AI ranking, environment configuration, and the payment non-goal.
- Add `shared-api` with the reviewed OpenAPI document `openspec/specs/shared-api/openapi.yaml`, the route inventory and access classes, JSON conventions, error and pagination envelopes, tolerant-reader rules, and the synchronous-only event model.

## Capabilities

### New Capabilities

- `admin-dashboard`: cross-cutting contract of the static Admin Platform UI.
- `swift-client`: cross-cutting contract of the canonical iOS client.
- `backend-core`: cross-cutting contract of the Quarkus backend.
- `shared-api`: shared HTTP contract between backend, iOS client, admin UI, and customer web page.

### Modified Capabilities

- None. Existing feature capabilities (`admin-platform-management`, `admin-authentication`, `admin-role-access-control`, `catalog-maintenance-operations`, `store-layout-management`, `product-catalog-search`, `ios-*`, `mobile-*`, `domain-model`, `deployment-operations`) stay authoritative for their feature details; the new capabilities reference them instead of duplicating them.

## Impact

- Documentation sources: `docs/audit/SYSTEM_MAP.md`, `docs/audit/CODE_AUDIT.md`, `docs/specs/AUDIT.md`, backend sources under `backend/indooro_server/src/main`, iOS sources under `swift/indooro-EinkaeuferFinal/indooroApp`, `k8s/`, `.github/workflows/ci.yaml`.
- Impacted systems: none at runtime. This change only adds specifications and the OpenAPI document.
- Auth: no route boundary changes. Protected and public routes are listed as they exist today; the insecure legacy routes are recorded as findings and are corrected by `protect-legacy-write-endpoints` and `harden-platform-security-baseline`.
- Demo proof: `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` passes and the four capabilities appear under `openspec/specs/`.
