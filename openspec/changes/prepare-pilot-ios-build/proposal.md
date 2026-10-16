## Why

The first supermarket pilot runs on two to three team iPhones with customers who get a one-minute introduction (see `docs/pilot-readiness/03_PILOT_READINESS.md`, blockers K6, K7). The pilot audit (`docs/pilot-readiness/01_PROJECT_AUDIT.md`) found that the current app is not ready to be handed to a test person:

- Product search breaks for queries containing `&`, `+` or `=` because `ProductSearchStore` encodes with `.urlQueryAllowed` (`Managers/ProductSearchStore.swift:27-29`), and failures only `print` and clear the list.
- The settings sheet shows „Tracking“, „Beacon“, „Debug (kein Beacon)“ and „Tap setzt Ziel“ to customers in Release builds (`Views/Main/SettingsSheet.swift:20-53`); English and developer terms leak into the German UI.
- Location and Bluetooth permission prompts fire at app launch without explanation (`Managers/BeaconManager.swift:278-280`); denial shows only a status string, Bluetooth off is not shown at all.
- Features that are not part of the pilot question are always on: AI upsell prompts and preloads, recipes tab, AR entry, automatic store detection that overrides the manual choice (`BeaconManager.swift:1111-1128`).
- The backend base URL is hardcoded in four files without timeouts; ATS is disabled globally (`Info.plist` `NSAllowsArbitraryLoads`).
- No `Assets.xcassets` exists in `swift/indooro-EinkaeuferFinal/indooroApp` although the project references `AppIcon` and `AccentColor`; the folder-synchronized target bundles `README.md`, unused layout JSON files and presentation files; the deployment target iOS 18.5 may exclude team devices.

The open change `fix-ios-contract-and-spec-drift` already specifies shared decoding, HTTP error handling, store-scoped search, store overview fixes and cleanup (sections 3, 4, 5, 6, 10). Those sections are implemented through this change on the pilot branch.

## What Changes

- Introduce `AppEnvironment` with the API base URL (Info.plist key `IndooroAPIBaseURL`, default LeoCloud), request timeouts, and a feature profile (`IndooroFeatureProfile`: `pilot` or `full`, default `pilot` on the pilot branch); DEBUG builds can switch the profile in settings.
- In profile `pilot`: hide the Rezepte tab, disable all upsell requests and prompts, hide the AR entry, disable automatic store switching (manual store selection only, or the single pilot store preselected).
- Fix search query encoding with `URLComponents`/`URLQueryItem` and implement `fix-ios-contract-and-spec-drift` sections 3, 4, 5 (decoding, HTTP status and German error messages, store-scoped search) and 6, 10 (store overview, cleanup).
- Rename tracking modes for customers: „Mit Ortung“ / „Ohne Ortung“; move map tap mode, debug log and recorder controls into a DEBUG-only section; translate remaining English labels.
- Add a one-screen first-run introduction and request Location/Bluetooth permission only when the customer turns on „Mit Ortung“; show banners for denied permission (with a link to iOS Settings) and for Bluetooth off.
- Add an asset catalog with app icon and accent color, remove non-app files from the target, remove `NSAllowsArbitraryLoads`, set the deployment target to the oldest iOS version among the pilot test devices (not below iOS 17).
- Remove dead views (`HeaderView`, `SearchOverlayView`, `MapHeaderView`, `LayoutSelectionSheet`) after confirming they are unreferenced.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `swift-client`: pilot feature profile, environment configuration, contextual permission requests and permission/Bluetooth state banners, customer-facing German labels.
- `product-catalog-search`: client query encoding and visible search errors.

## Impact

- iOS code (owner: Person A „iOS“ (Mac), branch `pilot/ios-pilot-build`): new `App/AppEnvironment.swift`, `Managers/ProductSearchStore.swift`, `Managers/RecipeStore.swift`, `Managers/UpsellSuggestionStore.swift`, `Views/Main/ContentView.swift`, `Views/Main/SettingsSheet.swift`, `Views/Main/HomeDashboardView.swift`, `Views/Main/ProductsPage` and search views, new `Views/Components/PermissionBanner.swift`, `Info.plist`, `MCindooroApp.xcodeproj/project.pbxproj` (deployment target, asset catalog only), new `indooroApp/Assets.xcassets`, `Models/MobileStoreModels.swift`.
- `BeaconManager.swift` only in: `apiBase` and URL construction, permission/Bluetooth state publishing and lazy permission request, store auto-detection guard, removal of `searchProducts` (see ownership rules in `add-pilot-guided-tour-fallbacks/design.md`).
- Backend, admin: unchanged. Section 2 of `fix-ios-contract-and-spec-drift` (backend dismissal bound) is owned by `release-pilot-backend`.
- Privacy: improved; no upsell requests leave the device in profile `pilot`.
