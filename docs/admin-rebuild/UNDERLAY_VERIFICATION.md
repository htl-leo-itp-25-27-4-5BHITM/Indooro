# Editor floor plan underlay verification

Branch: `pilot/editor-underlay`. The feature is available on the new per-store editor (`/admin/next/editor/?storeId=…`). The editor route flag on `main` remains off until the separate parity evidence change clears its P0 gaps.

- Per-store PNG/JPEG bytes and calibration are stored in PostgreSQL `layout_underlays` (Flyway V15). The protected `GET/PUT/DELETE /api/stores/{storeId}/layout/underlay` uses the same admin roles and store scope as other store layout routes. Its image response is `no-store`.
- Upload checks content type against image magic bytes, decoded size ≤10 MiB and dimensions ≤8000 px. HTTP body limit is 14 MiB to carry a 10 MiB Base64 image in JSON. The browser resizes images to ≤4000 px on the longest side and rejects unsupported types. PDF pages must be exported as PNG/JPEG before upload.
- A two-point distance sets meters per pixel. Optional horizontal alignment sets rotation. Offset, rotation, opacity and lock persist independently from layout versions. The image is drawn below the grid and does not enter the layout JSON or public mobile API.
- The Quarkus resource test covers 200/204/401/403/413/415, including a foreign-store denial. The explicit `UnderlayPostgresIT` test used an isolated local PostgreSQL 17 container, ran Flyway, uploaded `admin-ui/tests/fixtures/underlay-grid.png`, read the bytes and calibration back through SQL and HTTP, removed the image, and confirmed the mobile current-layout response excluded it. The test passed; the temporary container was stopped.
- Admin typecheck, lint, 71 unit tests, production package/build and 112 browser tests passed. The underlay browser test checks wrong-type rejection, upload, two-point calibration, offset persistence after reload and lock. OpenSpec strict validation passed 63/63.

## LeoCloud rollout · 2026-10-16

- PR [#111](https://github.com/htl-leo-itp-25-27-4-5BHITM/Indooro/pull/111) merged to `main` at `248091ecbdefcc574288009ca472c5e147e6285c`. [CI run 38935662693](https://github.com/htl-leo-itp-25-27-4-5BHITM/Indooro/actions/runs/38935662693) built the Admin UI and pushed backend image tag `:248091e` successfully.
- Before the merge, a database backup was created at `~/indooro-backups/indooro-2026-10-16-before-underlay.dump`; the file was nonempty and `pg_restore --list` read 127 entries. The backup is outside the repository. The previous running image digest was `sha256:5c49d5db9dee7047737cfea9a339ab6e28c181faf57576c0f9346a16b4b1167e`.
- The backend deployment was set to `:248091e`. It rolled out with one ready pod and zero restarts. The new image digest is `sha256:61a793ea4d2885ddb8dccd26737b0aefb1b7d620ec15eebbe56d0e5806df1464`. Startup logs confirm Flyway V15 applied and Quarkus started; no startup error appeared. Rollback was not needed.
- Live smoke after rollout: `/api/mobile/stores` 200 with 4 stores; one active store layout 200 with 48 elements and no underlay data; `/api/products/search?q=milch&size=5` 200 with 2 results; `/api/products?size=10000` 200 with 156 products, matching the pre-rollout count; `/admin/` and `/admin/next/` returned 302 to login; anonymous access to the protected underlay route returned 302 to login.
- One pre-rollout product-list request returned HTTP 500 due to an OpenSearch connection reset. The retry returned 200 with 156 products, and the post-rollout request returned 200 with the same count. No product code changed in this PR.

The editor route flag on `main` is still `editor: false`; the Legacy editor remains the default. No production underlay was written and no authenticated UI click test, physical pilot-store plan or end-user usability check was performed. The new editor remains subject to the separate parity evidence gate and pilot review.
