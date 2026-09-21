## Context

- `openspec/specs/shared-api/openapi.yaml` (OpenAPI 3.1, 86 operations) was written by hand on 2026-09-17 and diffed against all JAX-RS annotations (0 differences).
- `quarkus-smallrye-openapi` generates `/q/openapi` without operation ids, security, or access metadata.
- Swift models are hand-written with tolerant decoding; Admin UI uses untyped `fetch` wrappers; `admin:typecheck` is an alias of `node --check`.
- No route is versioned. The iOS app hard-codes `https://it220209.cloud.htl-leonding.ac.at/api` in four places.

## Goals / Non-Goals

**Goals:** one enforced contract; generated types for Swift and the Admin UI; a versioning and deprecation policy; uniform errors.

**Non-Goals:** GraphQL, gRPC, or AsyncAPI (no asynchronous channels exist); generating the backend from the contract (code-first stays); replacing the Admin UI build-free architecture.

## Decisions

1. **Code-first with reviewed snapshot.** The backend remains the implementation source; the reviewed YAML is the contract of record. CI exports `/q/openapi?format=json` from a test-profile start (`quarkus.smallrye-openapi.store-schema-directory=target/openapi`) and compares it with the reviewed YAML using `oasdiff diff` (structural) and `oasdiff breaking` (compatibility). Vendor extensions (`x-indooro-*`) exist only in the reviewed YAML and are ignored by the diff. Alternative: contract-first generation of JAX-RS interfaces. Rejected because it would rewrite 86 working endpoints.
2. **Versioning.** URI prefix `/api/v1`. Implementation: resources keep their `@Path`; a pre-matching `ContainerRequestFilter` rewrites `/api/v1/…` to `/api/…` and `quarkus.http.auth.permission.*.paths` list both forms. Responses carry `Indooro-Api-Version: 1`. A breaking change introduces new resource classes under `/api/v2`. Alternative: header versioning. Rejected because it is harder to route and cache.
3. **Deprecation.** A response filter adds `Deprecation: @<epoch>` and `Sunset: <HTTP-date>` (six months) plus `Link: <replacement>; rel="successor-version"` to deprecated operations listed in configuration.
4. **Errors.** Legacy resources throw `WebApplicationException` instead of building JSON strings, so all errors use `ApiErrorResponse`. The PDF routes return `ApiErrorResponse` as JSON for errors (the success media type stays `application/pdf`).
5. **Swift generation.** `api/openapi/indooro-mobile.yaml` (the file planned by `modernize-ios-client-architecture`) is produced by `scripts/export-mobile-openapi.mjs` from the reviewed contract, filtered to operations whose `x-indooro-consumers` include `ios`. `IndooroNetworking` generates **types only** with Apple's `swift-openapi-generator` build plugin and maps them to `IndooroModels`; the hand-written `APIClient` stays, as decided in that change. Tolerant decoding stays for free-form layout JSON.
6. **Admin UI typing.** `openapi-typescript` generates `admin/types/api.d.ts`; `core.js` and `app.js` use JSDoc `@typedef {import("./types/api").components["schemas"]["StoreSummaryResponse"]}`; `tsc --noEmit --allowJs --checkJs` runs in `admin:typecheck`. No bundler is added; the `.d.ts` file is not served.
7. **Contract tests.** httpYac suites validate response bodies with a JSON-schema step generated from the YAML; the smoke server mocks are validated in `node --test` (shared with `fix-admin-dashboard-contract-drift`).

## Risks / Trade-offs

- [Generated `/q/openapi` differs in representation details (nullable encoding, inline vs. referenced schemas)] → normalize both documents with `redocly bundle --dereferenced` before diffing; start with path/operation/parameter parity and tighten to schema parity once annotations are complete.
- [Aliasing doubles permission configuration] → a unit test asserts that every public or protected path has a `/api/v1` twin.
- [Two OpenAPI files could diverge] → `api/openapi/indooro-mobile.yaml` is generated from the reviewed contract and checked by the up-to-date step; it is never edited by hand.

## Migration Plan

1. Add annotations, error refactoring, `/api/v1` aliases, deprecation filter; deploy (backward compatible).
2. Enable CI contract job in warning mode for one sprint, then blocking.
3. Switch Admin UI and iOS to `/api/v1`.
4. After six months and a minimum iOS build on `/api/v1`, remove deprecated routes in a separate change.
