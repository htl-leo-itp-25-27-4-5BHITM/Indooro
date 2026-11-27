## Why

The redesign and polish in #228–#244 need repeatable checks that catch visual and accessibility regressions before merge. Shared design values currently need coordination across web and iOS; a generated token source can prevent drift while preserving the approved appearance.

## What Changes

- Package A: add Playwright `toHaveScreenshot` gates for `admin-ui`, `pilot-showcase`, customer web and landing at 390, 768 and 1440 px, with deterministic fixtures and reviewed Linux baselines.
- Package B: add `@axe-core/playwright` WCAG 2.1 AA checks for all three web surfaces, failing CI on serious or critical violations, and XCUITest `performAccessibilityAudit` checks for the canonical iOS app.
- Package C: introduce `design-tokens/tokens.json` in W3C DTCG format and deterministic CSS custom property and Swift constant generation. Migrate consumers as a pure refactor with no visual change.
- Document baseline bootstrap, strict comparison, diagnostics and token regeneration; retain all existing tests and gates.

## Capabilities

### New Capabilities

- `ui-quality`: Shared design token source, generation, consumer adoption and drift checks across web and iOS.

### Modified Capabilities

- `admin-platform-management`: Visual regression and web accessibility CI gates for `admin-ui`.
- `customer-web-experience`: Visual regression and web accessibility CI gates for the pilot showcase, customer finder and landing page.
- `ios-client-architecture`: Accessibility audits of fixture-driven main screens in simulator CI.

## Impact

This PR changes only `openspec/changes/add-ui-quality-gates/**`; it proposes future implementation rather than shipping the gates. Implementation will affect `admin-ui/`, `pilot-showcase/`, backend static customer/landing assets, root Playwright tooling, `.github/workflows/ci.yaml`, `.github/workflows/ios.yaml`, the new `design-tokens/` source/tooling and `swift/indooro-EinkaeuferFinal/`. Dependencies include Playwright and `@axe-core/playwright`; iOS audits run through Xcode on macOS. No HTTP contract or authorization change is required, so `shared-api` receives no delta. German UI copy remains German.

Sources: `openspec/config.yaml`, `openspec/CLI_USAGE.md`, the four affected capability contracts, `shared-api`, the current Playwright configurations and CI workflows. This change adds test and build contracts; it requires no production infrastructure deployment.
