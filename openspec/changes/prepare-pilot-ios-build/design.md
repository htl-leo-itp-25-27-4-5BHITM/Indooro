## Context

Paths relative to `swift/indooro-EinkaeuferFinal/indooroApp/` on `pilot/first-store`.

| Area | Current | Source |
|---|---|---|
| API base | literal `https://it220209.cloud.htl-leonding.ac.at/api` | `Managers/ProductSearchStore.swift:7`, `Managers/RecipeStore.swift:14`, `Managers/UpsellSuggestionStore.swift:50`, `Managers/BeaconManager.swift:171` |
| Search URL | `"\(apiBase)/products/search?q=\(encoded)&size=…"` with `.urlQueryAllowed` | `ProductSearchStore.swift:27-29` |
| Search errors | `print`, results cleared | `ProductSearchStore.swift:44-49` |
| Tabs | Start, Planung, Rezepte, Einkaufen, Karte | `Views/Main/ContentView.swift:28-101` |
| Settings | Sections „Tracking“, „Karte“, „Debug“, „AR“; tracking picker not DEBUG-guarded | `Views/Main/SettingsSheet.swift:20-90` |
| Permissions | requested in `BeaconManager.init` | `BeaconManager.swift:268-283` |
| Bluetooth state | debug log only | `BeaconManager.swift:2100-2103` |
| Store detection | applies detected store without confirmation, overrides manual layout mode | `BeaconManager.swift:1011-1128` |
| Upsell | preloads from `StoreMapPage` (lines 73-143), prompts in `ShoppingFeatureViews` | `UpsellSuggestionStore.swift` |
| ATS | `NSAllowsArbitraryLoads = true` | `Info.plist` |
| Assets | `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`, no catalog in this tree | `project.pbxproj`; catalogs exist only in legacy trees `swift/indooro-` and `swift/indooroApp` |
| Bundle | folder-synchronized group bundles everything under `indooroApp/` incl. `README.md`, 7 layout JSONs | `project.pbxproj` |

## Goals / Non-Goals

Goals: a calm, German, pilot-scoped app that a test person can use after a one-minute introduction; robust search; installable on team devices.

Non-goals: new features, redesign of screens, App Store submission, changes to navigation logic (owned by `add-pilot-guided-tour-fallbacks`), positioning parameters (owned by `establish-pilot-field-measurement`).

## Decisions

1. **Feature profile via Info.plist.** `AppEnvironment.featureProfile` reads `IndooroFeatureProfile` (`pilot`|`full`) from `Info.plist`; default `pilot` on this branch. Rationale: adding Xcode build configurations by hand in `project.pbxproj` is fragile (see `TESTING.md`). DEBUG builds get an override toggle stored in `UserDefaults`.
2. **Gate upsell at the source.** `UpsellSuggestionStore` returns early from every public request method when the profile disables upsell, so `StoreMapPage` preload calls (owned by another change) need no edit.
3. **Hide, do not delete.** Recipes, AR and upsell code stay; only entry points are hidden in profile `pilot`.
4. **Store auto-detection.** In profile `pilot`, detected stores are only shown as a suggestion („Filiale erkannt: <name> – öffnen?“) or ignored when a store is already selected; never applied silently.
5. **Permissions in context.** `CBCentralManager` and location authorization are created/requested lazily when the tracking mode becomes „Mit Ortung“. In „Ohne Ortung“ no permission prompt appears.
6. **Deployment target.** Collect the iOS versions of the pilot devices first (task 1.3); set the lowest version that compiles, not below 17.0 (SwiftPM package already declares iOS 17). Fix availability errors with `if #available` only where necessary.
7. **Asset catalog.** Create `indooroApp/Assets.xcassets` with `AppIcon` (single 1024 px image, generated from `logos/`) and `AccentColor`. The folder-synchronized group picks it up automatically.
8. **Bundle cleanup.** Move `indooroApp/README.md` and `indooroApp/presentation-airdrop-swift/` to `swift/indooro-EinkaeuferFinal/docs/`; keep only `layout.json` and `layout-demosupermarkt.json` in `Resources/` (others moved to `swift/indooro-EinkaeuferFinal/docs/legacy-layouts/`). Verify with a build that no code loads the moved files by name.

## File ownership

This change owns the files listed in the proposal's Impact. It must not edit `NavigationSessionCore.swift`, `NavigationSession.swift`, `MapView.swift`, `LayoutData.swift`, the target card/tour panel parts of `StoreMapPage.swift`, or positioning pipeline files. Rebase onto `origin/pilot/first-store` before every pull request.

## Risks / Trade-offs

- Lowering the deployment target can surface API availability errors; mitigated by task 1.3 and a build check.
- Hiding recipes changes the Start dashboard shortcuts; the dashboard must not link to hidden tabs.

## Migration / Rollback

Set `IndooroFeatureProfile = full` to restore all entry points. No data migration.
