# OpenSpec implementation verification — rebuild-admin-platform

Evidence cut: 2026-10-13. This is a current implementation audit, not an archive approval. The change uses the `spec-driven` schema with proposal, design, seven delta specs, and 39 tasks. Strict OpenSpec validation passes 41/41 repository items; syntax validation does not prove runtime acceptance. See `ROUTE_PARITY_MATRIX.md` for route-specific evidence and `RELEASE_EVIDENCE.md` for the local immutable image.

| Dimension | Current assessment |
| --- | --- |
| Completeness | 33/39 tasks checked; eight of ten legacy routes remain gated. |
| Correctness | All 14 delta requirements have implementation references; staff capability parity, multi-stage recipe failures, and complete map-routing proof still need scenario evidence. |
| Coherence | Typed React candidate, Quarkus packaging, backend authorization, unchanged layout JSON, staged route flags, and local rollback follow `design.md`. |

## Critical work before archive

1. **Task 1.1 timing cannot be recovered retroactively.** `BASELINE.md` records a running-stack review after implementation began. Keep the box open and preserve this exception in any later archival decision; do not rewrite its date or claim it was done first.
2. **Task 1.2 inventory is incomplete.** `ROUTE_INVENTORY.md` maps every route but lacks reproducible fixtures/screenshots for every action, role, and page state. Add focused fixtures for the eight gated rows, especially Store and global Editor actions, and reference them from the corresponding matrix row.
3. **Task 3.10 has eight gated routes.** `ROUTE_PARITY_MATRIX.md` records the remaining direct-link, keyboard, empty/error, role, and action checks. Switch a route only after its own row passes, then test the committed old URL and rollback. Dashboard and Diagnostics are the two locally approved routes.
4. **Task 5.3 lacks the complete API role matrix and final full gate.** Frontend typecheck/lint, 60 unit tests, 82 browser tests, package verification, 19 legacy Node and 27 browser checks, local live scripts, backend 116-test checkpoint, and strict OpenSpec validation have passed at their recorded cuts. Finish the role-by-operation matrix and rerun the relevant gates against the final artifact.
5. **Task 5.4 lacks complete live workflows for every action and role.** `live-admin-smoke.mjs` covers three OIDC roles, scoped denials, major CRUD paths, draft/publication, version recovery, and a recipe step failure/retry. The matrix still lists unexercised route variants, especially product/category import boundaries and other recipe partial-failure stages.
6. **Task 5.7 cannot complete yet.** Verify every requirement and scenario after the remaining gates, update tasks accurately, then use the normal OpenSpec archive workflow. Do not archive this active change while the acceptance gaps remain.

## Requirement and scenario findings

- **Staff capability parity (`admin-platform-management/spec.md`)**: only Dashboard and Diagnostics have passed local cutover. The eight remaining rows need their own authenticated comparisons. The candidate correctly removes legacy links that pointed scoped staff at inaccessible actions.
- **Recipe partial mutation (`backend-core/spec.md`, `admin-platform-management/spec.md`)**: a failed step now names its stage, reloads persisted detail, retains local input for explicit restoration, and retries successfully in the packaged UI. Ingredient creation/mapping and reorder failures can leave different partial states; exercise them and confirm a safe reconciliation path before approving Recipes.
- **Editor validation and mobile routing (`store-layout-management/spec.md`)**: bounds, assigned Beacon, shelf metadata, and conservative geometric approach warnings are covered. The editor does not prove end-to-end customer route reachability from layout geometry alone; compare actual customer routing targets on representative maps before approving Editor cutover.
- **Catalog bulk outcome (`catalog-maintenance-operations/spec.md`)**: row review exists, but commit stays blocked where current OpenSearch endpoints cannot return reliable per-row persisted outcomes or atomic rollback. Keep the control disabled until a reviewed backend contract can support it.

No design contradiction was found in the staged architecture or persistence boundary. The remaining issues are acceptance coverage and the explicitly recorded unsupported bulk-write contract. The change is **not ready to archive**.
