## Why

Only the platform-independent navigation core is tested (SwiftPM package `IndooroNavigationCore`, 77 tests). The Xcode project has no test target (`swift/indooro-EinkaeuferFinal/TESTING.md`): decoding of backend responses, shopping list persistence and merging, recipe/upsell models, search URL building, the feature profile and the study export are untested. Pilot changes touch exactly these areas. In addition, no CI job runs any Swift test, so regressions are only noticed on a Mac by chance; two of four team members work on Windows and cannot run Swift tests locally.

## What Changes

- Add the XCTest target `MCindooroAppTests` to the Xcode project (created in the Xcode UI, not by hand-editing `project.pbxproj`).
- Add JSON fixtures and tests for model decoding (stores, layout responses, products incl. lossy arrays, recipes, upsell plan/suggestion, shopping list items with backward-compatible fields), shopping list merge/deduplication and persistence round trip, `AppEnvironment` parsing, search URL building, and the study export formatting.
- Add a GitHub Actions workflow `ios.yaml` on a macOS runner that runs `swift test` for the navigation package and `xcodebuild test` for the app tests on every pull request to `pilot/first-store` and `main`.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ios-client-architecture`: app logic test target and CI for Swift tests.

## Impact

- Owner: Person A „iOS“ (Mac), branch `pilot/ios-test-target` from `pilot/first-store`.
- Files: `MCindooroApp.xcodeproj` (new target via Xcode UI), `swift/indooro-EinkaeuferFinal/MCindooroAppTests/**` (new), `swift/indooro-EinkaeuferFinal/Fixtures/**` (new JSON fixtures), `.github/workflows/ios.yaml` (new), `TESTING.md`.
- No production behavior change. Tests may reveal defects; fixes go into the change that owns the file.
