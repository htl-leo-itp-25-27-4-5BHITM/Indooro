import XCTest

/// Store-Wechsel per Scan: ein Scan wechselt die Filiale und setzt die Position (add-ios-pilot-ui-tests 3.x / Anker).
final class StoreSwitchUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
        UITestSupport.registerCameraPermissionMonitor(for: self)
    }

    func testScanOfOtherStoreSwitchesStoreAndSetsPositionWithOneScan() {
        let app = UITestSupport.launchApp()
        UITestSupport.openStoreLayout(in: app)

        UITestSupport.submitScannerPayload(
            "https://example.at/customer/?store=\(UITestSupport.storeCode2)&a=B7",
            in: app
        )

        let alert = app.alerts["Dieser Code gehört zu \(UITestSupport.storeName2). Wechseln?"]
        XCTAssertTrue(alert.waitForExistence(timeout: UITestSupport.timeout), "Wechsel-Abfrage erscheint nicht")
        alert.buttons["Wechseln"].tap()

        XCTAssertTrue(
            app.staticTexts[UITestSupport.storeName2].waitForExistence(timeout: UITestSupport.timeout),
            "Karte zeigt nicht „\(UITestSupport.storeName2)“"
        )
        XCTAssertTrue(
            app.descendants(matching: .any).matching(identifier: "debugPayloadField").firstMatch
                .waitForNonExistence(timeout: UITestSupport.timeout),
            "Scanner schließt sich nach dem Wechsel nicht"
        )
        XCTAssertTrue(
            UITestSupport.positionBanner(in: app).waitForNonExistence(timeout: UITestSupport.timeout),
            "Position ist nach dem Wechsel-Scan nicht gesetzt"
        )
    }
}
