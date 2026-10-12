# Local release artifact and rollout inputs

Evidence date: 2026-10-12. This is a local build; no registry push or LeoCloud rollout was performed.

## Artifact

From `admin-ui`, `npm run package:candidate && npm run verify:candidate` installed the Vite output into Quarkus static resources under `/admin/next/`. From `backend/indooro_server`, `DB_PORT=55433 sh ./mvnw -q package -DskipTests` produced `target/opensearch-api-1.0.0-SNAPSHOT-runner.jar` (SHA-256 `db7c04ba99883d0a52ead14e37ce0a587c416797d32d9311fa47a6d76af1a2b4`). The backend tests were run separately. `docker build -f src/main/docker/Dockerfile -t indooro-admin-rebuild:local-7b0effd .` succeeded. The local immutable image ID is `sha256:2c5ae618fbe2ac39788a681734d805e5c8996e94a2c0d503e9377872c989f829`; the mutable local tag is only a convenience label. The built image was not pushed.

The image ran locally in the Quarkus `prod` profile with the dedicated PostgreSQL, Keycloak, and OpenSearch services. Anonymous `/api/mobile/stores` returned 200; unauthenticated `/api/admin/me` and `/admin/next/editor/` redirected to Keycloak. With authenticated demo sessions, `ADMIN_SMOKE_HOST_ALIAS=1 npm run test:live:cutover` passed all ten route switch/rollback pairs. `ADMIN_SMOKE_HOST_ALIAS=1 npm run test:live` passed 12 candidate deep links and refreshes, 11 denied scoped direct links, 18 scope assertions, beacon assignment/release/reassignment, public contracts, draft and global publication, recipe lifecycle, and concurrent layout saves/activations. The live editor workflow also persisted shelf `accessAngle`, `layoutCode`, and `productPositions` into the public active layout. The alias maps the container-only Keycloak hostname to `127.0.0.1` in Chromium. The image was bound to local port 8080 because the demo Keycloak client permits that redirect URI. Candidate checks also passed typecheck, lint, 58 unit tests, and 50 mocked browser tests; strict OpenSpec validation passed 41/41.

## Deployment inputs to review

`k8s/backend.yaml` currently names `ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:latest` with `imagePullPolicy: Always`. A rollout needs a published image digest in that manifest and the matching rollback digest recorded before applying it. `k8s/keycloak.yaml`, `k8s/opensearch.yaml`, and `k8s/postgres.yaml` define the dependencies; the live local acceptance used Keycloak 26.2, OpenSearch 2.9, and PostgreSQL 17. Version differences from LeoCloud must be checked before deployment.

The backend manifest references `indooro-openai-secret/OPENAI_API_KEY` and `indooro-keycloak-secret/admin-web-client-secret`; database connection fields are currently literal manifest values. Review secret provisioning and OIDC issuer/client configuration in the target namespace. Do not copy local demo credentials to production.

The manifest has TCP startup and readiness probes on port 8080, with no HTTP liveness probe. TCP readiness only proves the process listens; the protected and public endpoint smoke below verifies application behavior. Resource limits are 500m CPU and 512Mi memory. Verify these against the image at deployment time.

## Smoke after an authorized rollout

Use the deployed base URL and an authorized staff session:

1. Public: `GET /api/mobile/stores`, `GET /api/products?size=5`, `GET /api/mobile/stores/{storeId}/layout/current`, and `GET /api/mobile/recipes?page=0&size=5`; verify status and response shape.
2. Protected: `GET /api/admin/me`, each `/admin/next/*` direct link and refresh, region/store scoped reads, and denial of foreign store/region mutations and admin-only diagnostics.
3. Editor: save a draft, verify the public mobile layout is unchanged, publish with confirmation, verify one active version and the new public layout; inspect history and rollback behavior.
4. Route map: keep all `route-cutover.js` flags disabled until `ROUTE_INVENTORY.md` parity rows are complete. Flip one flag in a new immutable image, verify its path and query/fragment behavior, and restore the previous digest or flag value if the gate fails.

The local equivalents are `cd admin-ui && npm run test:live`, `npm run test:live:cutover`, and `npm run test:browser` against the dedicated stack. `LIVE_STACK.md` has setup and role fixtures. These do not replace a production rollout test or an iOS device journey.
