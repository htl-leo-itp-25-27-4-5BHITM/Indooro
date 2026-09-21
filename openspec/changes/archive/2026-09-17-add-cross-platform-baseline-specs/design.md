## Context

The audit reviewed every tracked source file, ran the backend test suite (70 tests, all passing, 31 % line coverage), and built the iOS app with complete strict-concurrency checking (120 unique diagnostics). The results are in `docs/audit/`. OpenSpec already contains 21 feature-oriented capabilities. The request for this change was to establish single-source-of-truth specs for the admin dashboard, the Swift client, the backend core, and the shared API.

## Goals / Non-Goals

**Goals:**

- Give each subsystem one capability that states its cross-cutting contract.
- Make the shared HTTP contract machine-readable (`openapi.yaml`) and reviewable.
- Keep the new capabilities truthful: every requirement is either implemented today or is a governance rule for future changes.

**Non-Goals:**

- Fixing any defect. Defects are tracked in `docs/audit/CODE_AUDIT.md` and addressed by `harden-platform-security-baseline`, `fix-admin-dashboard-contract-drift`, `optimize-backend-data-access`, `establish-shared-api-contract`, `protect-legacy-write-endpoints`, `fix-ios-contract-and-spec-drift`, and `modernize-ios-client-architecture`.
- Duplicating feature requirements that already live in other capabilities.
- Inventing subsystems that do not exist. The request template mentions React/Vue, GraphQL, AsyncAPI, payment, push notifications, and offline sync; none of these exist. The specs state their absence explicitly.

## Decisions

1. **Umbrella capabilities reference feature capabilities.** `admin-dashboard` points to `admin-platform-management` and `store-layout-management` for detailed workflows; `swift-client` points to the `ios-*` and `mobile-*` capabilities; `backend-core` points to `admin-role-access-control`, `domain-model`, and `catalog-maintenance-operations`. Alternative considered: merging all feature specs into four large files. Rejected because it would break the history of the seven archived changes and every active change delta.
2. **The OpenAPI document lives next to `shared-api/spec.md`.** OpenSpec only reads `spec.md`; the YAML file is an additional artifact in the same folder. Alternative: generating it from `/q/openapi` at build time. Rejected for now because the generated document lacks auth classification, error envelopes, and the tolerant field descriptions the clients rely on. `establish-shared-api-contract` introduces generation plus diffing.
3. **Known defects are not written as normative behavior.** Where the code violates an existing requirement (for example the admin logout path, anonymous legacy layout writes, or unescaped editor output), the baseline states the intended rule only if another capability already demands it, and otherwise leaves the rule to the follow-up change that fixes the code. This keeps `validate --strict` meaningful and avoids archiving insecure behavior as a requirement. Where a baseline requirement states intended behavior and the code deviates only in a narrow spot, the deviation is listed under „Implemented vs. Planned“ together with the change that removes it.
4. **Current-state facts that are intentionally temporary are phrased as governance.** Example: the Swift 5 language mode is a measured baseline, and the requirement is that new code must not increase the strict-concurrency diagnostic count.

## Implemented vs. Planned

| Area | Implemented | Planned (other changes) |
| --- | --- | --- |
| Admin tables, filters, bulk import | yes, client-side over the first server page | server-side paging and filtering (`fix-admin-dashboard-contract-drift`) |
| Output encoding in admin | `app.js` escapes consistently | editor and customer page escaping, CSP (`harden-platform-security-baseline`) |
| iOS push notifications, sync | not implemented, not planned | – |
| Backend audit actor | always `SYSTEM` | real actor (`harden-platform-security-baseline`) |
| Admin form error display | shown for beacon, product, category, recipe forms | region and store drawers block silently (`fix-admin-dashboard-contract-drift`) |
| Audit coverage | regions, stores, beacons, assignments, layouts, recipes, ingredients, steps, mappings | recipe tags, products, categories (`harden-platform-security-baseline`) |
| OpenAPI | hand-reviewed document | generated + diffed in CI, typed clients (`establish-shared-api-contract`) |

## Risks / Trade-offs

- [Hand-written OpenAPI can drift from code] → `establish-shared-api-contract` adds a CI diff against `/q/openapi`.
- [Umbrella specs may overlap feature specs] → requirements are limited to cross-cutting rules; feature details are referenced by capability name.

## Migration Plan

Documentation-only. Archive after validation. Rollback: delete the four spec folders and restore the archived change folder.
