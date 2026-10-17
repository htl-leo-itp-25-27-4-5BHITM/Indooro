import XCTest

/// QR-Anker im Scanner-Fallback (DEBUG-Feld „Payload einfügen“), add-ios-pilot-ui-tests 3.x / Anker.
final class AnchorScanUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
        UITestSupport.registerCameraPermissionMonitor(for: self)
    }

    func testAnchorPayloadSetsPositionAndClosesScanner() {
        let app = UITestSupport.launchApp()
        UITestSupport.openStoreLayout(in: app)
        XCTAssertTrue(
            UITestSupport.positionBanner(in: app).waitForExistence(timeout: UITestSupport.timeout),
            "Hinweis „Position ungenau“ fehlt vor dem Scan"
        )

        UITestSupport.submitScannerPayload(
            "https://example.at/customer/?store=\(UITestSupport.storeCode)&a=A12",
            in: app
        )

        // Erfolg: Scanner schließt sich und die Position ist gesetzt.
        XCTAssertTrue(
            app.descendants(matching: .any).matching(identifier: "debugPayloadField").firstMatch
                .waitForNonExistence(timeout: UITestSupport.timeout),
            "Scanner schließt sich nach dem Anker-Scan nicht"
        )
        XCTAssertTrue(
            UITestSupport.positionBanner(in: app).waitForNonExistence(timeout: UITestSupport.timeout),
            "„Position ungenau“ bleibt nach dem Anker-Scan sichtbar"
        )
    }

    func testUnknownAnchorShowsHintAndKeepsScannerOpen() {
        let app = UITestSupport.launchApp()
        UITestSupport.openStoreLayout(in: app)

        UITestSupport.submitScannerPayload(
            "https://example.at/customer/?store=\(UITestSupport.storeCode)&a=A99",
            in: app
        )

        let hint = app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS %@", "Unbekannter Code"))
            .firstMatch
        XCTAssertTrue(hint.waitForExistence(timeout: UITestSupport.timeout), "Hinweis „Unbekannter Code“ fehlt")
        XCTAssertTrue(
            app.descendants(matching: .any).matching(identifier: "debugPayloadField").firstMatch.exists,
            "Scanner schließt sich bei unbekanntem Anker"
        )
        XCTAssertTrue(
            UITestSupport.positionBanner(in: app).exists,
            "Position wurde trotz unbekanntem Anker gesetzt"
        )
    }
}
