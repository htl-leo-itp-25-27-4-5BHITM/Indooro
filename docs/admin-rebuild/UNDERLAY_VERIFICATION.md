# Editor floor plan underlay verification

Branch: `pilot/editor-underlay`. The feature is available on the new per-store editor (`/admin/next/editor/?storeId=…`). The editor route flag on `main` remains off until the separate parity evidence change clears its P0 gaps.

- Per-store PNG/JPEG bytes and calibration are stored in PostgreSQL `layout_underlays` (Flyway V15). The protected `GET/PUT/DELETE /api/stores/{storeId}/layout/underlay` uses the same admin roles and store scope as other store layout routes. Its image response is `no-store`.
- Upload checks content type against image magic bytes, decoded size ≤10 MiB and dimensions ≤8000 px. HTTP body limit is 14 MiB to carry a 10 MiB Base64 image in JSON. The browser resizes images to ≤4000 px on the longest side and rejects unsupported types. PDF pages must be exported as PNG/JPEG before upload.
- A two-point distance sets meters per pixel. Optional horizontal alignment sets rotation. Offset, rotation, opacity and lock persist independently from layout versions. The image is drawn below the grid and does not enter the layout JSON or public mobile API.
- The Quarkus resource test covers 200/204/401/403/413/415, including a foreign-store denial. The explicit `UnderlayPostgresIT` test used an isolated local PostgreSQL 17 container, ran Flyway, uploaded `admin-ui/tests/fixtures/underlay-grid.png`, read the bytes and calibration back through SQL and HTTP, removed the image, and confirmed the mobile current-layout response excluded it. The test passed; the temporary container was stopped.
- Admin typecheck, lint, 71 unit tests, production package/build and 112 browser tests passed. The underlay browser test checks wrong-type rejection, upload, two-point calibration, offset persistence after reload and lock. OpenSpec strict validation passed 63/63.

No physical pilot-store plan, LeoCloud route smoke, or end-user usability check was performed for this change. The route should remain subject to the existing editor rollout gate and pilot review.
