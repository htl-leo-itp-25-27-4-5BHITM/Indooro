## Current state

Nine Admin route flags are enabled. The Store and global Layout Editor remain on the Legacy entry; the Candidate is available through `/admin/next/editor/`. `docs/admin-rebuild/EDITOR_ACTION_MATRIX.md` and `EDITOR_EVIDENCE_GAPS.md` identify the remaining action, role, state, and device evidence. The flag is `editor: false` in `admin/route-cutover.js`.

## Evidence decisions

- Compare each Legacy and Candidate action from the same explicit `layoutId`, role and Store scope. A Store URL without `layoutId` can load the latest private draft after another UI saves one, so it is not an equivalent starting fixture.
- Keep paired drafts private. Verify the version API and anonymous Mobile Current separately; restore any published disposable version through the UI before archiving fixtures.
- Record each observed behavior difference, its fixture and the Product Owner's acceptance or required fix. A screenshot proves the visible state, not the API post-state or publication.
- On 2026-10-16 the Product Owner accepted three Candidate semantics: Export/Preview do not write an implicit draft, JSON import preserves extra metadata, and publication is blocked without an entrance. The other gaps remain open.

## Cutover and rollback

Keep `editor: false` until the P0 action and role matrix and the remaining required gates pass. Then exercise a committed switch with Store and global direct links, query/fragment, refresh, and a return to Legacy. Data version recovery and route rollback are separate checks. Retain the old image as the full rollback point. No production route switch or device result is inferred from local mock or API evidence.

## Implementation notes

**2026-10-18 local cutover.** On `pilot/editor-default`, a newly packaged `prod` image with the Dev-Realm and disposable PostgreSQL/OpenSearch stack passed the committed Editor Store/global redirect, query/fragment, refresh, all three roles, scoped denials, `?legacy=1`, and simulated `editor:false` rollback. The flag is `true` on this branch. Exact fixtures, screenshots, a transient first-run failure and the unrelated full-live product-search timeout are recorded in `docs/admin-rebuild/EDITOR_CUTOVER_2026-10-18.md`. Physical-device evidence and archive approval remain open; this is not a production rollout.

**2026-10-17 takeover.** Erik handed the open P0 work to a Claude Code session. All three P0 gaps were closed with automated proof (`docs/admin-rebuild/EDITOR_P0_CLOSURE.md`), missing Legacy functions were rebuilt in the Candidate, three Candidate defects found by the new edge-case tests were fixed, and the `?legacy=1` route fallback was added. The `editor` value in `route-cutover.js` is intentionally still `false` in the committed branch: Erik's instruction was to switch it once all P0 gaps are closed, but the session's permission classifier refused to commit that single change, so it is left as a documented step (`docs/admin-rebuild/ROUTE_CUTOVER.md`). The proposal's "No Admin route is switched" therefore still holds for the committed state. Differences classified `accepted-improvement` / `accepted-removed` in `legacy-parity-map.json` are proposals by the session, not Product Owner decisions; only the three items of 2026-10-16 are. Open: physical device route (2.2), live switch against the packaged stack (2.3), screen-reader audit, archive (3.2).

The paired manager probe now uses the same active fixture in both UIs for raster-height edit, shelf duplicate, Inspector delete and Undo. Legacy Inspector delete is immediate; Candidate confirms it. Candidate rejects publication of the duplicate shelf address; a separate valid draft is used for the existing publish/restore test. Both roles' temporary scope assignments and disposable fixtures were restored or archived after the passing run. This closes only those named cases, not the complete P0 inventory.
