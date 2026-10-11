# Admin platform baseline and functional audit

Date: 2026-10-11. Source: `origin/main` at `99b802b8`, the active OpenSpec artifacts, source inspection, and the local smoke harness. This document distinguishes code paths from observed behavior. The smoke server substitutes JSON responses and does not prove PostgreSQL, OpenSearch, Keycloak, or production persistence.

## Runtime map

| Concern | Current authority and execution path | Consumer or consequence |
| --- | --- | --- |
| Staff login and scope | Keycloak OIDC session; Quarkus route policy; `AdminAccessService` checks subject assignments in PostgreSQL | Admin pages and region/store/beacon/layout mutations |
| Region, store, beacon, recipe, access, logs | Quarkus resource → service → Panache entity/repository → PostgreSQL/Flyway | Admin workflows; mobile store detection and recipes |
| Catalog products and categories | Admin and legacy resources → `OpenSearchService`/`CategoryService` → OpenSearch | Admin product maintenance; customer and mobile search |
| Store layout versions | `/api/stores/{id}/layout/*` → `StoreLayoutAdminService` → PostgreSQL `layout_versions` | Admin editor store mode; `/api/mobile/stores/{id}/layout/current`; canonical iOS map |
| Legacy global layout | `/api/layout/current` → `LayoutService` → OpenSearch `layouts` index | Editor legacy mode; deployed customer web; iOS fallback |

The two layout stores are independent. Publishing a PostgreSQL store version does not update the legacy OpenSearch document. Any migration or deprecation needs an explicit consumer plan and fixture checks for both paths.

## Existing staff surfaces

| Surface | Visible functions in current code | Evidence and current limit |
| --- | --- | --- |
| Dashboard | Scope counts, setup warnings, recent audit, quick actions | Mocked browser render passed; counts use paged lists, so totals can be wrong beyond the first page. |
| Regions | List, create/edit, archive | Quarkus route/service exists; live role/scoped CRUD not yet exercised. |
| Stores | List/filter, create/edit, detail, layout versions, audit links | Mocked browser render passed; filters are applied after paging and can show false empty pages. |
| Beacons | Inventory, create/edit, bulk input, assignment/release | Route/service exists; live bulk and role matrix not yet exercised. |
| Products and categories | Search/list, edit, import, category context | OpenSearch is the catalog store; global numeric product document ID can collide across stores; import result semantics need verification. |
| Recipes | List, edit, tags, ingredients, steps, mapping, publication | Existing static edit path can omit complete detail and lose fields; `null` tag update previously cleared assignments. Browser checks use mocks. |
| Diagnostics | Audit/error logs | Protected resource exists; direct scoped-denial and live data access need verification. |
| Layout editor | Store/legacy mode, element palette, selection/draw/move, properties, version save/publish, import/export | Browser presentation and history interactions tested with mocks; save/load round trip and mobile routing compatibility still unverified. |

## Reproduced baseline and checks

- Before rebuild changes: `npm run admin:build` passed; 11 Node unit tests passed; after installing the missing Playwright Chromium runtime, all 12 existing smoke tests passed. They mainly checked page rendering, not real API persistence.
- Before the new change: `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` passed 40 items. An archived planning change had checked implementation tasks despite no React/Vite admin application in the checkout. Its checkboxes were not used as runtime evidence.
- Existing Quarkus tests use mocked dependencies in important areas. They can pass when local PostgreSQL is unavailable; DB transaction and OIDC integration require a running stack.
- Browser inspection at 1440×900 showed a dense editor toolbar, three fixed panels, and a small map stage surrounded by unused canvas space. At 768×900, the entire element palette and templates precede the canvas vertically, so the map is below the first viewport. Editor actions mix German and English labels.

## Root causes and current priorities

1. **Security boundary:** the legacy layout POST had a public route policy while editor labels were interpolated into HTML. The route now requires admin access and editor/customer text rendering has browser regressions; remaining legacy write routes and CSP are still open in their owning changes.
2. **Data integrity:** recipe tag `null` input cleared assignments; first store draft currently autoactivates when no active version; store layout version numbering uses `max+1` without serialization. The tag fix is committed; draft and concurrency work remain.
3. **Contract drift:** dashboard/recipe/store list mocks differed from paged backend responses; layout status used an absent `active` flag; product readiness rejected documented slash-delimited codes. The first status/readiness fixes are committed. Paging, complete recipe edits, and contract-checked mocks remain.
4. **Editor state:** the editor recorded pre-mutation snapshots and lost redo; selection also polluted history. Browser regressions now cover reversible draw/move/property/duplicate/delete. Pure commands, dirty-state warnings, geometry validation, draft persistence, and real mobile compatibility remain.
5. **Architecture:** shared `app.js` and `editor.js` initialize broad state through direct DOM mutation. OpenSpec now specifies a staged typed frontend with route parity gates; no route has switched to it yet.

The implementation status and commit trail are in `docs/admin-rebuild/PROGRESS.md` once work slices complete. Until live stack and role tests are run, none of these surfaces should be called end-to-end verified.
