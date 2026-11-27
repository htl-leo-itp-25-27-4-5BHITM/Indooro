## Context

This is a proposed implementation contract following redesign/polish #228–#244. The current branch contains browser suites for `admin-ui` (`tests/browser`, local candidate server) and `pilot-showcase` (`tests/e2e`, Vite preview). Root Playwright tooling serves backend static resources through `scripts/serve-admin-smoke.mjs`. The showcase already uses reduced motion for functional tests. `.github/workflows/ci.yaml` pins both frontend browser jobs to `ubuntu-24.04` because the current Chromium installation cannot use Ubuntu 26.04. `.github/workflows/ios.yaml` runs the canonical app scheme and UI tests on macOS.

Existing contracts were reviewed in `admin-platform-management`, `customer-web-experience`, `ios-client-architecture`, `admin-dashboard` and `shared-api`. The first three own surface-specific additions. A new `ui-quality` capability owns shared tokens because `shared-api` defines HTTP contracts, not design assets. The existing admin parity evidence work remains complementary: these repeatable gates do not establish production editor cutover parity.

The developer Mac has no Docker. Linux baselines must come from CI. This documentation-only PR is confined to `openspec/changes/add-ui-quality-gates/**`; no gates, tokens or baseline files are implemented here.

## Goals / Non-Goals

**Goals:** Detect visual drift across three responsive widths; block serious/critical WCAG 2.1 AA web findings and iOS audit failures; establish one typed token source with reproducible CSS and Swift output; preserve the current visual design and German copy.

**Non-Goals:** Product redesign, backend/API changes, authentication changes, complete WCAG certification, new telemetry, legacy iOS migration, production deployment, or replacing existing functional, security and accessibility evidence. Automated scans supplement keyboard, screen-reader and Dynamic Type checks.

## Decisions

### A: Extend existing Playwright suites with deterministic screenshot checks

Use Chromium and `toHaveScreenshot` in the existing frontend suites, plus a focused root customer/landing suite serving the actual backend static assets. Keep existing functional projects and assertions. Add explicit visual projects at widths 390, 768 and 1440 px, with fixed heights (844, 1024 and 900 px respectively) and documented capture areas. Pin the browser/package version through lockfiles, install its matching browser and use the same font setup on `ubuntu-24.04`. Fixed dimensions and platform-qualified snapshot paths make failures reproducible.

Coverage starts with admin dashboard, management list, form/dialog and editor; showcase initial view, content tabs and tour; landing initial page; customer store selection, populated product search and map/list state. Each package records the exact routes and capture states next to its tests so assertions cannot pass by capturing only a loading screen. Serve deterministic local fixtures, wait for app readiness and fonts, fix time/locale/timezone where relevant, and disable animations using both `reducedMotion: "reduce"` and screenshot `animations: "disabled"`. Mask only volatile dates/identifiers or nondeterministic map/canvas regions; retain surrounding controls and layout assertions. Prefer fixed map fixtures when practical. Do not blanket-mask pages.

Use `maxDiffPixelRatio: 0.01` or a stricter value per suite. Any threshold increase requires review and must remain at or below 0.01. Upload expected, actual and diff images plus the Playwright report on failure. CI must propagate assertion errors. Browser gates run for pull requests to main when their surfaces, fixture tooling, tokens or workflow definitions change. Shared token changes trigger all affected consumer gates, including iOS. Keep existing workflow coverage and required checks.

Alternative: a hosted screenshot service or local macOS baselines. Existing Playwright infrastructure avoids a new service, and Linux-generated images match CI. Docker baseline generation is unavailable on the developer Mac.

### A: Bootstrap once in Linux CI, then compare strictly

The implementation's first push explicitly uses `--update-snapshots=missing` for only the new visual tests. CI uploads distinct snapshot-folder artifacts for admin, showcase and customer/landing, including when another test fails. Download with `gh run download <run-id> -n <snapshot-artifact> -D <temporary-directory>`, inspect the images and restore them to the matching suite's snapshot paths. Review and commit the Linux PNGs, remove the bootstrap flag, then push and obtain a strict passing run before acceptance. Bootstrap is a temporary implementation step, not a permanent fallback when files disappear. Existing snapshots are never overwritten by the missing-only bootstrap.

Normal CI has no snapshot update flag and fails on missing images as well as mismatches. Later intentional design changes use a separate explicit update run and reviewed snapshot commit. Preserve platform qualifiers so a Mac capture cannot replace a Linux reference. Document these commands and artifact paths in each suite's contributor instructions.

### B: Apply one web accessibility policy across all surfaces

Add `@axe-core/playwright` to the relevant package lockfiles. Use tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`; WCAG 2.1 includes the preceding 2.0 A/AA criteria. Scan ready pages at the same three widths, including open dialogs, active tabs and results states. Retain the full report and fail for any violation whose impact is `serious` or `critical`; lower impacts remain visible. No blanket exclusions or disabled rules to get green CI. Fix findings in the affected surface while retaining German labels.

Admin tests use the existing isolated server and explicit role/scope fixtures; this neither changes Keycloak/OIDC nor substitutes for runtime authorization tests. Customer/landing tests stay anonymous. Run web audits alongside functional and visual gates, with independently recognizable failures. Alternative: manual-only audits would not provide a repeatable pull-request gate; automated checks still cannot prove full accessibility compliance.

### B: Audit canonical iOS UI states using XCTest

Extend `MCindooroAppUITests` in `swift/indooro-EinkaeuferFinal/` and scheme `MCindooroApp`. Launch with `-uiTesting`, use existing bundled fixtures, and navigate Start, Planung, Rezepte, Einkaufen, Karte plus representative search, tour and dialog states. Call `performAccessibilityAudit` after each state is ready and identify the screen in the test name. Use a selected simulator runtime supporting the API in macOS CI; record Xcode/runtime and destination in results. Run audits for PRs to main and pilot/first-store, including relevant token/generator changes.

Let reported issues fail XCTest; do not add issue handlers that return success for real findings. Export `.xcresult` even after failure. An unavailable audit-capable runtime is a CI setup failure, not a passing skipped test. Apple audits are a separate platform gate; the axe severity filter does not apply to them. Alternative: porting axe to native views is unsuitable; XCTest operates on the native accessibility tree.

### C: Generate CSS and Swift from a typed token source

Create `design-tokens/tokens.json` using DTCG `$type`/`$value` definitions and aliases. Inventory current color, typography, spacing and radius usage before migration. Preserve platform and appearance differences through named semantic tokens rather than forcing unlike existing values together. Document the supported DTCG subset and reject unsupported types, invalid values, missing references, cycles and generated name collisions.

Use a deterministic generator with explicit mappings for CSS units, Swift points, color components/alpha, font names/weights and light/dark values. Dimension conversions must preserve current rendering rather than assume that every CSS value maps numerically to points. Emit CSS custom properties included by admin, showcase and static customer/landing assets, and typed Swift constants compiled by the canonical app target. Select and document exact output paths during C1/C2 integration. Commit generated files with headers and a common regeneration command so static serving and Xcode do not require Node at runtime.

Generate to temporary locations, validate everything and replace outputs only after success. A check mode compares every generated output with committed files and exits nonzero on drift. CI triggers cover source, generator and consumer changes. Verify alias/error handling and deterministic generation, CSS consumption/builds and Swift compilation. Alternative: independent CSS/Swift hand-maintained files allow drift; runtime token parsing adds complexity to a pure build-time refactor.

## Risks / Trade-offs

- Font, browser or OS updates can change rasterization → retain platform-specific baselines and review updates with the environment change.
- Masks can conceal regressions → limit them to named volatile regions and retain geometry/interaction coverage.
- Fixture scans cannot cover all production data or accessibility behavior → document covered states and retain manual keyboard, VoiceOver and Dynamic Type evidence.
- Token normalization can change color or font rendering → compare before/after on identical web and iOS configurations; correct mappings without refreshing baselines to hide drift.
- Parallel package work can overlap CI and token consumers → coordinate changes to the shared workflows and let C validate against A/B once their gates exist.
- Full simulator audits add CI time → use deterministic ready states and bounded timeouts while preserving the required screen coverage.

## Migration Plan

1. Implement A and B in their existing suites, preserving all current checks. Bootstrap and commit Linux baselines, then prove strict comparison catches a temporary intentional mismatch and missing file.
2. Establish C's source from existing values, generate outputs and migrate web/iOS consumers incrementally. Capture iOS before/after evidence on the same simulator in light/dark and representative Dynamic Type settings; compare web output against A's pre-migration baselines.
3. Prove axe severity failures, iOS audit execution and token drift failure behavior, remove temporary negative controls and retain reports in implementation evidence.
4. Update contributor commands and CI path filters. No production infrastructure rollout is necessary; token adoption ships through normal application builds. Archive only after all implementation tasks and verification pass.

Rollback uses a revert of the affected consumer/generator change to restore the prior rendering; correct a gate configuration regression in a reviewed commit. Do not remove existing tests, suppress accessibility findings, relax thresholds or disable required CI checks as a rollback shortcut.

## Open Questions

No blocking product decisions. Implementation must record exact screenshot inventories, snapshot artifact/output paths and the selected audit simulator. These are integration details within the requirements above, not grounds to reduce coverage or defer a gate.
