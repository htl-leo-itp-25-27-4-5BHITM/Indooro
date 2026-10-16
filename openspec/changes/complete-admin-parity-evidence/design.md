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

The paired manager probe now uses the same active fixture in both UIs for raster-height edit and shelf duplicate. Candidate rejects publication of the duplicate shelf address; a separate valid draft is used for the existing publish/restore test. Both roles' temporary scope assignments and disposable fixtures were restored or archived after the passing run. This closes only those named cases, not the complete P0 inventory.
