## Decisions

1. **Fixture mode**: launch argument `-uiTesting` makes `AppEnvironment` serve stores, layout and products from bundled JSON (`Fixtures/ui-test-store/`), disables BLE, permissions and network.
2. **Identifiers**: `accessibilityIdentifier` on search field, result rows, shelf text, tour buttons, „Ich bin hier“, map; owners add them on request.
3. **Stability**: no sleeps; use `waitForExistence`; map taps at fixed relative coordinates from the fixture layout.
4. **CI**: run on pull requests only; retry once on simulator boot failure.

## Implementation notes (2026-10-17)

- Deviation from decision 1: `AppEnvironment` does not exist yet (`prepare-pilot-ios-build` is not merged). The fixture mode is `-uiTesting` plus the DEBUG-only `INDOORO_API_BASE_URL` override against `scripts/dev/mock_mobile_api.py` (`MOCK_DATASET=ui-test-store`); the app itself reads no bundled JSON. The same fixtures could later be served from the bundle through `AppEnvironment`.
- The tab bar lies under the keyboard: tests dismiss it before switching tabs (`UITestSupport.dismissKeyboardIfShown`).
- Observation: after „Tour starten“ the Karte tab shows the store overview again although the layout of the store is active; the test taps the store card to continue. Worth a look in `StoreMapPage`/`ContentView` (`pendingLastStoreLayoutOpenRequest`).

