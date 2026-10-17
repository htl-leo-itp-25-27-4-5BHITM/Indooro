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
        // Auf langsamen Runnern (CI, iOS 26.5) kann die ScrollView der Karte noch animieren; ein Tipp
        // stoppt dann nur die Bewegung und kommt nicht an. Daher bis zu dreimal tippen, bis der Hinweis weg ist.
        var tapAttempts = 0
        repeat {
            tapAttempts += 1
            map.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        } while !hint.waitForNonExistence(timeout: 5) && tapAttempts < 3

        // Die Position ist gesetzt: Tipp-Hinweis und „Position ungenau“ verschwinden.
        XCTAssertTrue(hint.waitForNonExistence(timeout: UITestSupport.timeout), "Tipp-Hinweis bleibt sichtbar")
        XCTAssertTrue(
            UITestSupport.positionBanner(in: app).waitForNonExistence(timeout: UITestSupport.timeout),
            "„Position ungenau“ bleibt nach dem Setzen sichtbar"
        )
    }
}
