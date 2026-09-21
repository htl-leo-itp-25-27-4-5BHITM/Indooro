## 1. Contract Tooling

- [ ] 1.1 Add `@redocly/cli`, `openapi-typescript`, and `typescript` as dev dependencies and scripts `contract:lint`, `contract:types`.
- [ ] 1.2 Add a lint rule set requiring `operationId`, `tags`, and `x-indooro-access` on every operation.
- [ ] 1.3 Configure `quarkus.smallrye-openapi.store-schema-directory=target/openapi` for the test profile and an export step in the Maven build.
- [ ] 1.4 Add MicroProfile OpenAPI annotations (`@Operation(operationId=…)`, `@Tag`, `@SecurityRequirement`, `@APIResponse`) to all 86 operations.
- [ ] 1.5 Add the normalized parity check and `oasdiff breaking` against the target branch.

## 2. Versioning and Deprecation

- [ ] 2.1 Add the `/api/v1` pre-matching rewrite filter and the `Indooro-Api-Version` response header.
- [ ] 2.2 Duplicate HTTP permission paths for `/api/v1` and add a unit test that checks every permission path has a v1 twin.
- [ ] 2.3 Add the configurable deprecation filter with `Deprecation`, `Sunset`, and `Link` headers for the four listed operations; mark them `deprecated: true` in the contract.
- [ ] 2.4 Document the versioning and deprecation policy in `docs/audit/MODERNIZATION_BLUEPRINT.md` and `DEPLOYMENT.md`.

## 3. Error Envelope

- [ ] 3.1 Refactor `ProductResource`, `CategoryResource`, `LayoutResource`, `AdminResource`, `ImportResource`, and `ExportResource` to throw `WebApplicationException` instead of building error bodies.
- [ ] 3.2 Update the contract responses to `ApiErrorResponse` and remove `LegacyError` once no operation references it.

## 4. Generated Clients

- [ ] 4.1 Make `scripts/export-mobile-openapi.mjs` (planned in `modernize-ios-client-architecture` task 7.2) read the reviewed contract, filter by `x-indooro-consumers: ios`, and write `api/openapi/indooro-mobile.yaml`; the Swift type generation itself stays in `modernize-ios-client-architecture` task 7.3.
- [ ] 4.2 Generate `admin/types/api.d.ts`, add `// @ts-check` and JSDoc types to `core.js` and `app.js`, and change `admin:typecheck` to `tsc --noEmit`.
- [ ] 4.3 Add an up-to-date check for generated files.

## 5. Contract Tests

- [ ] 5.1 Add schema validation steps to the httpYac suites.
- [ ] 5.2 Validate smoke mocks against the contract in `node --test`.

## 6. CI

- [ ] 6.1 Add the `contract` job and make the image job depend on it and on a backend test job without `-DskipTests`.

## 7. Verification

- [ ] 7.1 Demonstrate a failing contract job for an undocumented field rename.
- [ ] 7.2 Demonstrate identical responses for `/api/mobile/stores` and `/api/v1/mobile/stores` and identical 401/403 behavior for protected v1 aliases.
- [ ] 7.3 Run `npx -y @fission-ai/openspec@1.3.1 validate establish-shared-api-contract --strict`.
