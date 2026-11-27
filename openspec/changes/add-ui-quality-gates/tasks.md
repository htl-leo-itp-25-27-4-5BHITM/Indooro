## 1. Package A — Visual regression

- [ ] 1.1 A1 admin-ui visual: Record dashboard, management list, form/dialog and editor capture states; add deterministic role/scope fixtures and readiness/font checks to the existing browser suite.
- [ ] 1.2 A1 admin-ui visual: Add `toHaveScreenshot` projects at 390, 768 and 1440 px with fixed heights, reduced motion, disabled animations, targeted volatile masks and `maxDiffPixelRatio` <= 0.01.
- [ ] 1.3 A2 pilot-showcase visual: Add initial view, representative tab and tour screenshots at all three widths with fixed data, readiness checks and the same motion, masking and threshold policy.
- [ ] 1.4 A3 customer web visual: Add a local static-assets suite covering landing plus `/customer/` store selection, results and map/list at all three widths, using fixed public API fixtures and the same screenshot policy.
- [ ] 1.5 A1–A3 CI: Extend the browser jobs on `ubuntu-24.04`, preserving existing checks and adding customer/landing coverage, matching browser/font installation and expected/actual/diff report uploads on failure; include relevant source, fixture and workflow paths.
- [ ] 1.6 A1–A3 baseline bootstrap: On the first implementation push run only the new visual tests with `--update-snapshots=missing`, upload each snapshot folder, download using `gh run download`, inspect and commit the Linux baselines without replacing them with Mac images.
- [ ] 1.7 A1–A3 strict verification: Remove the bootstrap flag, push again and pass comparison at every width; temporarily prove an excessive unmasked difference and a missing baseline each fail CI, then remove those negative controls.
- [ ] 1.8 A1–A3 documentation: Record exact capture inventories, Linux artifact paths, bootstrap/download commands, strict local/CI commands and the reviewed intentional-update procedure.

## 2. Package B — Accessibility gates

- [ ] 2.1 B1 admin axe: Install `@axe-core/playwright` with lockfile updates; scan dashboard, list, form/dialog and editor fixture states at all three widths with `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`; fail on serious/critical impact and retain full diagnostics.
- [ ] 2.2 B2 showcase axe: Add tagged scans for initial view, active content tabs and tour states at 390, 768 and 1440 px with the same severity policy and reports.
- [ ] 2.3 B3 customer web axe: Add anonymous tagged scans for landing, store selection, product results and map/list at all three widths with the same severity policy and reports.
- [ ] 2.4 B1–B3 remediation: Fix reported serious/critical findings in each package while preserving German UI copy and existing auth boundaries; retain lower-impact findings in reports without blanket exclusions or disabled rules.
- [ ] 2.5 B1–B3 CI verification: Wire scans into pull-request jobs, preserve functional/visual checks, prove a temporary serious/critical fixture fails and a lower-impact finding remains reported, then remove negative controls and pass clean scans.
- [ ] 2.6 B4 iOS audit: Extend `MCindooroAppUITests` with `performAccessibilityAudit` for Start, Planung, Rezepte, Einkaufen, Karte and representative search/tour/dialog states using `-uiTesting` fixtures without live network, BLE or permission prompts.
- [ ] 2.7 B4 iOS audit: Select and document an audit-capable Xcode/simulator destination in macOS CI for main and pilot/first-store pull requests; retain `.xcresult` on failure and fail setup if the runtime cannot execute audits.
- [ ] 2.8 B4 iOS remediation and verification: Fix audit findings without suppression, demonstrate that an audit issue fails XCTest/CI and pass all required fixture states after removing the temporary negative control.
- [ ] 2.9 B1–B4 documentation: Record covered states, commands, artifacts and automated coverage limits, retaining manual keyboard, VoiceOver and Dynamic Type verification guidance.

## 3. Package C — Shared design tokens

- [ ] 3.1 C1 token source + CSS generation: Inventory existing web/iOS color, typography, spacing and radius values and capture pre-migration appearance evidence; establish DTCG `design-tokens/tokens.json` with typed values, aliases and explicit platform/appearance semantics.
- [ ] 3.2 C1 token source + CSS generation: Implement deterministic CSS custom property generation with documented type/unit mappings, supported DTCG subset, generated-file headers and a regeneration command; reject invalid values, unsupported types, unresolved/cyclic aliases and output-name collisions without partial writes.
- [ ] 3.3 C1 token source + CSS generation: Commit generated CSS, integrate it into admin-ui, pilot-showcase, customer and landing build/static serving, and replace corresponding shared values with generated properties while preserving responsive behavior and German copy.
- [ ] 3.4 C1 token source + CSS generation: Add temporary-output drift checking to CI, trigger affected web gates for token/generator changes and verify generation determinism, error handling, stale-output failure and all web builds.
- [ ] 3.5 C2 iOS Swift generation: Generate typed Swift constants from the same source with explicit color/alpha, dimension, font and light/dark mappings; document and commit the generated output and include it in the canonical MCindooroApp target.
- [ ] 3.6 C2 iOS Swift generation: Migrate corresponding canonical views to generated constants and verify compilation, alias/error handling, deterministic output and stale-Swift failure in CI; trigger iOS build/audit checks for token/generator changes.
- [ ] 3.7 C1–C2 parity verification: Pass A/B gates against pre-migration web baselines and compare iOS before/after captures on the same simulator in light/dark and representative Dynamic Type settings; correct conversion drift without refreshing baselines to hide it.
- [ ] 3.8 C1–C2 documentation: Record exact output paths, shared regeneration/check commands, naming/conversion rules, consumer integration and normal build delivery/rollback steps; confirm no production infrastructure deployment is required.

## 4. Final verification and archive

- [ ] 4.1 Verify every added requirement against implementation evidence, keep existing tests/security/CI gates intact, and run `npx -y @fission-ai/openspec@1.3.1 validate add-ui-quality-gates --strict` plus `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 4.2 After A, B and C are implemented and verified, archive `add-ui-quality-gates` with OpenSpec so the reviewed deltas reach permanent specs, then validate the archived result. Do not archive this proposal-only PR.
