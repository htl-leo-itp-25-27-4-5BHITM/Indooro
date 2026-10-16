## Decisions

1. **Fixture mode**: launch argument `-uiTesting` makes `AppEnvironment` serve stores, layout and products from bundled JSON (`Fixtures/ui-test-store/`), disables BLE, permissions and network.
2. **Identifiers**: `accessibilityIdentifier` on search field, result rows, shelf text, tour buttons, „Ich bin hier“, map; owners add them on request.
3. **Stability**: no sleeps; use `waitForExistence`; map taps at fixed relative coordinates from the fixture layout.
4. **CI**: run on pull requests only; retry once on simulator boot failure.
