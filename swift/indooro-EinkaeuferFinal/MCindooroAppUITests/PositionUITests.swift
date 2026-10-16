import XCTest

/// „Ich bin hier“: Position per Tippen auf die Karte setzen (add-ios-pilot-ui-tests 3.3).
final class PositionUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
    }

    func testIchBinHierSetsPositionWithTapOnMap() {
        let app = UITestSupport.launchApp()
        UITestSupport.openStoreLayout(in: app)

        // Ohne Ortung ist die Position zunächst ungenau.
        XCTAssertTrue(
            UITestSupport.positionBanner(in: app).waitForExistence(timeout: UITestSupport.timeout),
            "Hinweis „Position ungenau“ fehlt vor dem Setzen"
        )

        let iAmHere = app.buttons["Ich bin hier"]
        XCTAssertTrue(iAmHere.waitForExistence(timeout: UITestSupport.timeout), "„Ich bin hier“ fehlt")
        iAmHere.tap()

        let hint = app.staticTexts["Tippe auf deinen Standort"]
        XCTAssertTrue(hint.waitForExistence(timeout: UITestSupport.timeout), "Tipp-Hinweis erscheint nicht")

        let map = UITestSupport.storeMap(in: app)
        XCTAssertTrue(map.waitForExistence(timeout: UITestSupport.timeout), "Karte fehlt")
        map.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()

        // Die Position ist gesetzt: Tipp-Hinweis und „Position ungenau“ verschwinden.
        XCTAssertTrue(hint.waitForNonExistence(timeout: UITestSupport.timeout), "Tipp-Hinweis bleibt sichtbar")
        XCTAssertTrue(
            UITestSupport.positionBanner(in: app).waitForNonExistence(timeout: UITestSupport.timeout),
            "„Position ungenau“ bleibt nach dem Setzen sichtbar"
        )
    }
}
