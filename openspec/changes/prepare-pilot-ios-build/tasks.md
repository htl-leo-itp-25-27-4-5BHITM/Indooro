## 1. Setup and Discovery

- [x] 1.1 Create branch `pilot/ios-pilot-build` from `origin/pilot/first-store` in its own worktree; confirm `swift test` in `swift/indooro-EinkaeuferFinal` passes (77 tests) and the simulator build from `TESTING.md` succeeds before any change; record both outputs in `design.md` under „Baseline“.
- [x] 1.2 Re-read `fix-ios-contract-and-spec-drift` sections 3, 4, 5, 6, 10 against the current code; record in this `design.md` which tasks still apply unchanged, which need adaptation, and which are obsolete.
- [ ] 1.3 Ask the team (human step) for model and iOS version of every pilot test iPhone; record them in `docs/pilot-readiness/team/DEVICES.md`. (Mensch: Team nennt iPhone-Modelle und iOS-Versionen)
- [x] 1.4 Run `npx -y @fission-ai/openspec@1.3.1 validate prepare-pilot-ios-build --strict`.

## 2. Environment and Feature Profile

- [x] 2.1 Add `App/AppEnvironment.swift` with `apiBaseURL` (Info.plist `IndooroAPIBaseURL`, fallback LeoCloud), `requestTimeout` (15 s), and `featureProfile` (`IndooroFeatureProfile`, default `pilot`) plus a DEBUG-only `UserDefaults` override.
- [x] 2.2 Add both keys to `Info.plist`.
- [x] 2.3 Replace the `apiBase` literals in `ProductSearchStore`, `RecipeStore`, `UpsellSuggestionStore` and `BeaconManager` with `AppEnvironment.apiBaseURL`; use a shared `URLSession` configuration with the timeout.
- [x] 2.4 Verify with `grep -rn "it220209" swift/indooro-EinkaeuferFinal/indooroApp` that only `AppEnvironment` remains.

## 3. Pilot Profile Gating

- [x] 3.1 Hide the Rezepte tab and the dashboard shortcut `onOpenRecipes` in profile `pilot` (`ContentView`, `HomeDashboardView`).
- [x] 3.2 Return early from every public request method of `UpsellSuggestionStore` in profile `pilot`; hide upsell prompt UI; verify with the DEBUG network log that no `/mobile/upsell/` request is sent during a full tour. (Beleg: `UpsellSuggestionStore` gibt außerhalb `allowsExtendedFeatures` früh zurück, Sheet in `ContentView.swift` abgesichert; DEBUG-Log-Lauf über eine Tour: Mensch)
- [x] 3.3 Hide the AR section of `SettingsSheet` in profile `pilot`.
- [x] 3.4 In `BeaconManager` store detection (`applyDetectedStore`, around lines 1011-1128): in profile `pilot`, never replace an active store; when none is active, show the suggestion „Filiale erkannt: <name> – öffnen?“ (or apply only if exactly one store exists and the customer has not chosen another). Keep profile `full` unchanged.
- [x] 3.5 Add unit tests for `AppEnvironment` parsing (missing key, invalid value, override).

## 4. Search (incl. fix-ios-contract-and-spec-drift 3, 4, 5)

- [x] 4.1 Build search URLs with `URLComponents` and `URLQueryItem` in `ProductSearchStore` (search and category list).
- [x] 4.2 Implement `fix-ios-contract-and-spec-drift` 3.1–3.3 (shared ISO-8601 decoder, lossy product array). (Beleg: `Utilities/PilotNetworking.swift` `JSONDecoder.indooro` und `LossyDecodableArray`; Tests `PilotNetworkingTests`, `ContractDecodingTests`)
- [x] 4.3 Implement 4.1–4.3 (HTTP status check, `errorMessage`, „Suche fehlgeschlagen“ + „Erneut versuchen“) and the empty state „Keine Treffer für „<Begriff>““.
- [x] 4.4 Implement 5.1–5.3 (store-scoped search with `storeId`/`storeCode`, remove `BeaconManager.searchProducts` and related state).
- [x] 4.5 Add tests for URL building with `Milch & Käse`, `a+b`, `50%`, `#1`, `Käse?` (pure function, can live in the SwiftPM target or a new XCTest target if needed).
- [x] 4.6 Mark the implemented tasks in `fix-ios-contract-and-spec-drift/tasks.md` with „(implemented in prepare-pilot-ios-build)“.

## 5. Settings, Labels, Introduction, Permissions

- [x] 5.1 Rename tracking modes in UI to „Mit Ortung“ / „Ohne Ortung“; move „Tippen setzt Ziel“, debug log, recorder and layout-source controls into `#if DEBUG`. (Beleg: `Views/Main/SettingsSheet.swift`, Debug-Bedienelemente in `#if DEBUG`)
- [x] 5.2 Replace remaining English/developer terms in customer-facing strings (search `Views/` for „Tracking“, „Beacon“, „Tap“, „Store“, „Layout“, „LeoCloud“, „Debug“); keep debug log lines unchanged. (Beleg: sichtbare Texte „Standard“/„Standard-Layout“ → „Ersatzplan“ in `StoreMapPage.swift` und `MobileStoreModels.swift`, Test `StoreMapHelpersTests` angepasst; übrige Treffer nur in ungenutzten Dateien, siehe 6.5)
- [x] 5.3 Make permission requests lazy: create `CBCentralManager` and call `requestLocationAuthorizationIfNeeded` only when tracking mode becomes „Mit Ortung“ (`BeaconManager` init and mode switch).
- [x] 5.4 Publish `bluetoothState` and `locationAuthorization` from `BeaconManager`; add `Views/Components/PermissionBanner.swift` with the two banners and an „Einstellungen öffnen“ button (`UIApplication.openSettingsURLString`); show it in the indoor map.
- [x] 5.5 Add the first-launch introduction screen (three points, „Los geht's“), persisted flag, reachable via the Start tab help button; default positioning mode for new installs = „Ohne Ortung“.
- [x] 5.6 Implement `fix-ios-contract-and-spec-drift` 6.1–6.4 (store overview without fake coordinates, address subtitle, title „Filialen“) and 10.1–10.2 (cleanup); mark them there. (Beleg: `Models/MobileStoreModels.swift` `validCoordinate`/`displaySubtitle`, Titel „Filialen“ in `StoreMapPage.swift`)

## 6. Build and Distribution Hygiene

- [x] 6.1 Create `indooroApp/Assets.xcassets` with `AppIcon` (1024 px from `logos/`) and `AccentColor`; verify the built app shows the icon in the simulator.
- [x] 6.2 Move `indooroApp/README.md`, `indooroApp/presentation-airdrop-swift/` and unused layout JSONs out of the synchronized folder (see design decision 8); confirm via build and a search for file names that nothing loads them.
- [x] 6.3 Remove `NSAllowsArbitraryLoads` from `Info.plist`; verify all requests still succeed against LeoCloud (HTTPS). (Beleg: `NSAllowsArbitraryLoads` nicht mehr in `Info.plist`; Live-Prüfung gegen LeoCloud: Mensch)
- [ ] 6.4 Set `IPHONEOS_DEPLOYMENT_TARGET` to the lowest pilot device version from 1.3 (not below 17.0); fix availability errors. (Mensch: niedrigste Pilot-iOS-Version hängt an 1.3; Ziel bleibt 18.5)
- [ ] 6.5 Delete `HeaderView.swift`, `SearchOverlayView.swift`, `MapHeaderView.swift`, `LayoutSelectionSheet.swift` after confirming with a project-wide search that they are unreferenced; coordinate with Erik first because `add-pilot-guided-tour-fallbacks` replaces the „Ich stehe hier“ control. (Mensch: Löschen braucht Freigabe von Erik; alle vier Dateien sind projektweit unreferenziert, nicht im `project.pbxproj`)
- [x] 6.6 Write `docs/pilot-readiness/team/INSTALL_ON_DEVICE.md`: how to install the pilot build from Xcode on a team iPhone (signing team, trust developer, 7-day limit with free accounts), and how to switch the profile in DEBUG.

## 7. Verification and Handover

- [x] 7.1 Run `swift test`, the simulator build, and `npx -y @fission-ai/openspec@1.3.1 validate prepare-pilot-ios-build --strict`.
- [ ] 7.2 Manual check list in the simulator, recorded with screenshots under `docs/pilot-readiness/evidence/ios-pilot-build/`: fresh install (no permission prompt, introduction), search „Milch & Käse“, server-down search error (wrong base URL via DEBUG override), Release-like settings sheet, profile `pilot` tab bar, Bluetooth-off banner (device only; otherwise note as open). (Mensch: Release-artige Einstellungen, wiederholter Erststart und Bluetooth-Aus nur manuell am Simulator/Gerät; Teil-Belege in `docs/pilot-readiness/evidence/prepare-pilot-ios-build/`)
- [ ] 7.3 Install on at least one real iPhone (human step) and record the result in `docs/pilot-readiness/team/DEVICES.md`. (Mensch: echtes iPhone)
- [x] 7.4 Open a pull request `pilot/ios-pilot-build` → `pilot/first-store` with outputs and screenshots; update `docs/pilot-readiness/team/STATUS.md` (row „Person A“).
