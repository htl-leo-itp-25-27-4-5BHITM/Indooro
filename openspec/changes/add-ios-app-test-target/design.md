## Context

- Project uses a folder-synchronized group for `indooroApp/`; one native target `MCindooroApp`; bundle id `at.ac.htl.leonding.indooroswift2`.
- `TESTING.md` warns against creating test targets by editing `project.pbxproj` by hand and lists the recommended first tests (recipe/upsell models, shopping list decoding and merge).
- `fix-ios-contract-and-spec-drift` 1.3 asks for live JSON fixtures under `swift/indooro-EinkaeuferFinal/Fixtures/`.

## Goals / Non-Goals

Goals: safety net for the pilot-touched app logic; CI that runs Swift tests for everyone.

Non-goals: UI tests, snapshot tests, coverage targets, refactoring for testability beyond small extractions.

## Decisions

1. **Target creation in Xcode UI** (human step, ~5 minutes): File → New → Target → Unit Testing Bundle, name `MCindooroAppTests`, host app `MCindooroApp`, folder-synchronized group `MCindooroAppTests/`. The agent writes test files afterwards.
2. **Fixtures.** Live responses captured with `curl` from LeoCloud (anonymous mobile routes only) plus hand-made edge cases; stored under `swift/indooro-EinkaeuferFinal/Fixtures/`.
3. **CI.** `macos-latest` runner; steps: `swift test` in `swift/indooro-EinkaeuferFinal`, then `xcodebuild test -scheme MCindooroApp -destination 'platform=iOS Simulator,name=<available iPhone>' CODE_SIGNING_ALLOWED=NO`; simulator name resolved dynamically with `xcrun simctl list`. Cache SwiftPM build directory.
4. **Shared logic in the package.** Pure helpers that do not import UIKit/SwiftUI may move into the SwiftPM target to be tested there (and on Linux CI later); only with agreement of the file owner.

## Risks / Trade-offs

- CI minutes on macOS runners are limited for private repositories; run on pull requests only, not on every push.
- Simulator availability differs between runner images; the workflow selects any available iPhone simulator.

## Migration / Rollback

Test-only; rollback = remove target and workflow.
