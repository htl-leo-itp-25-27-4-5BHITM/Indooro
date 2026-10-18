## 1. Contract Tooling

- [x] 1.1 Add `@redocly/cli`, `openapi-typescript`, and `typescript` as dev dependencies and scripts `contract:lint`, `contract:types`. Evidence: root `package.json` devDependencies and `contract:lint`/`contract:types` scripts; `redocly.yaml`.
- [x] 1.2 Add a lint rule set requiring `operationId`, `tags`, and `x-indooro-access` on every operation. Evidence: custom Redocly assertion in `redocly.yaml`; removing `x-indooro-access` makes `npm run contract:lint` fail.
- [x] 1.3 Configure `quarkus.smallrye-openapi.store-schema-directory=target/openapi` for the test profile and an export step in the Maven build. Evidence: `%test.quarkus.smallrye-openapi.store-schema-directory=target/openapi` in `application.properties`; `npm run contract:export` runs `OpenApiExportTest` through `scripts/contract/export-generated.mjs`.
- [x] 1.4 Add MicroProfile OpenAPI annotations (`@Operation(operationId=…)`, `@Tag`, `@SecurityRequirement`, `@APIResponse`) to all 86 operations. Evidence: `@Operation(operationId)` and `@Tag` on all resource classes, `at.htl.openapi.IndooroOpenApi` (info and security schemes); `scripts/contract/compare-operation-ids.mjs` reports no difference to the 92 reviewed operations. `@APIResponse` and per-method `@SecurityRequirement` are not added: schemas and responses stay in the reviewed contract and the parity check does not require them.
- [x] 1.5 Add the normalized parity check and `oasdiff breaking` against the target branch. Evidence: `scripts/contract/check-parity.mjs` (92 operations, 128 parameters, 33 request bodies, 49 schemas, 275 properties, 26 known diffs in `scripts/contract/parity-known-diffs.json`); `oasdiff breaking` runs in the CI `contract` job on pull requests (action not runnable locally, first CI run confirms it).

## 2. Versioning and Deprecation

- [ ] 2.1 Add the `/api/v1` pre-matching rewrite filter and the `Indooro-Api-Version` response header. (zurückgestellt: Backend-Logik, parallele Sicherheits-/Datenzugriffs-Sessions; eigene Folgeänderung)
- [ ] 2.2 Duplicate HTTP permission paths for `/api/v1` and add a unit test that checks every permission path has a v1 twin. (zurückgestellt: Backend-Logik, parallele Sicherheits-/Datenzugriffs-Sessions; eigene Folgeänderung)
- [ ] 2.3 Add the configurable deprecation filter with `Deprecation`, `Sunset`, and `Link` headers for the four listed operations; mark them `deprecated: true` in the contract. (zurückgestellt: Backend-Logik, parallele Sicherheits-/Datenzugriffs-Sessions; eigene Folgeänderung)
- [x] 2.4 Document the versioning and deprecation policy in `docs/audit/MODERNIZATION_BLUEPRINT.md` and `DEPLOYMENT.md`. Evidence: section 3.4a in `docs/audit/MODERNIZATION_BLUEPRINT.md` and section "API-Versionierung" in `DEPLOYMENT.md`; both state that the runtime parts (2.1-2.3) are not yet active.

## 3. Error Envelope

- [ ] 3.1 Refactor `ProductResource`, `CategoryResource`, `LayoutResource`, `AdminResource`, `ImportResource`, and `ExportResource` to throw `WebApplicationException` instead of building error bodies. (zurückgestellt: Backend-Logik, parallele Sicherheits-/Datenzugriffs-Sessions; eigene Folgeänderung)
- [ ] 3.2 Update the contract responses to `ApiErrorResponse` and remove `LegacyError` once no operation references it. (zurückgestellt: Backend-Logik, parallele Sicherheits-/Datenzugriffs-Sessions; eigene Folgeänderung)

## 4. Generated Clients

Coordination (2026-10-12): `docs/admin-rebuild/CHANGE_COORDINATION.md` records that the TypeScript client and compiler in `rebuild-admin-platform` can replace the legacy Admin `core.js`/`app.js` JSDoc portion of 4.2 after route cutover. Task 4.2 stays open while the old static routes run. Reviewed-schema generation, generated-file freshness, mobile export, contract parity, and CI remain owned by this change; the React client does not satisfy them.

- [x] 4.1 Make `scripts/export-mobile-openapi.mjs` (planned in `modernize-ios-client-architecture` task 7.2) read the reviewed contract, filter by `x-indooro-consumers: ios`, and write `api/openapi/indooro-mobile.yaml`; the Swift type generation itself stays in `modernize-ios-client-architecture` task 7.3. Evidence: `scripts/export-mobile-openapi.mjs` writes `api/openapi/indooro-mobile.yaml` (16 iOS operations, 49 components); `npm run contract:mobile:check` verifies freshness. No Swift file touched (Swift generation: later, after `fix-ios-contract-and-spec-drift`). Swift type generation: IndooroNetworking (PR Phase 1).
- [ ] 4.2 Generate `admin/types/api.d.ts`, add `// @ts-check` and JSDoc types to `core.js` and `app.js`, and change `admin:typecheck` to `tsc --noEmit`. (partial) Evidence: `admin-ui/src/api/generated/schema.d.ts`, `admin/types/api.d.ts` and `customer/types/api.d.ts` are generated (`npm run contract:types`), `admin-ui` type-checks against them (`src/api/contract-types.test.ts`). Open: JSDoc/`@ts-check` in legacy `core.js`/`app.js` stays open until route cutover, see the coordination note.
- [x] 4.3 Add an up-to-date check for generated files. Evidence: `npm run contract:types:check` and `npm run contract:mobile:check`, both run in the CI `contract` job.

## 5. Contract Tests

- [x] 5.1 Add schema validation steps to the httpYac suites. Evidence: `api-tests/httpyac/support/contract.mjs` (`validateResponse`) used in `01-public-routes.http`, `05-recipes.http`, `06-upsell.http`; 7 node tests; verified offline against a local server (valid payload passes, `{items}` payload fails). Not run against the live API.
- [x] 5.2 Validate smoke mocks against the contract in `node --test`. Evidence: `backend/indooro_server/src/test/js/admin-smoke-contract.test.mjs` (delivered by `fix-admin-dashboard-contract-drift`, merged in #139) validates the smoke mocks against the reviewed contract in `npm run admin:test`.

## 6. CI

- [x] 6.1 Add the `contract` job and make the image job depend on it and on a backend test job without `-DskipTests`. Evidence: `.github/workflows/ci.yaml` has jobs `contract` and `backend-test` (`mvn -B verify`, no `-DskipTests`); `build-and-push` has `needs: [contract, backend-test]`. Not executed on GitHub yet.

## 7. Verification

- [x] 7.1 Demonstrate a failing contract job for an undocumented field rename. Evidence: `scripts/contract/check-parity.test.mjs` renames `MobileStoreSummary.storeCode` in a mutated generated document and expects exit code 1 (`npm run contract:test`).
- [ ] 7.2 Demonstrate identical responses for `/api/mobile/stores` and `/api/v1/mobile/stores` and identical 401/403 behavior for protected v1 aliases. (zurückgestellt: Backend-Logik, parallele Sicherheits-/Datenzugriffs-Sessions; eigene Folgeänderung)
- [x] 7.3 Run `npx -y @fission-ai/openspec@1.3.1 validate establish-shared-api-contract --strict`. Evidence: `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` -> 60 passed, 0 failed.
