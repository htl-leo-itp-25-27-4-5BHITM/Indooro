import XCTest

final class PilotSmoke: XCTestCase {
    func testPilotIntroductionAndSearchError() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "at.ac.htl.leonding.indooroswift2")
        app.launchEnvironment["INDOORO_API_BASE_URL"] = "https://127.0.0.1:1/api"
        app.launchArguments = ["-IndooroIntroductionCompleted", "NO"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Willkommen bei Indooro"].waitForExistence(timeout: 15))
        XCTAssertEqual(XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.count, 0)
        save(app, "introduction")
        app.buttons["Los geht's"].firstMatch.tap()
        XCTAssertTrue(app.tabBars.buttons["Planung"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.tabBars.buttons["Rezepte"].exists)
        save(app, "pilot-tabs")
        app.tabBars.buttons["Planung"].tap()
        let query = app.textFields["Was möchtest du kaufen?"]
        XCTAssertTrue(query.waitForExistence(timeout: 5))
        query.tap()
        query.typeText("Milch & Käse")
        XCTAssertTrue(app.staticTexts["Suche fehlgeschlagen"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["Erneut versuchen"].exists)
        save(app, "search-error")
        query.typeText("\n")
        app.tabBars.buttons["Karte"].tap()
        XCTAssertTrue(app.staticTexts["SPAR-Filialen"].waitForExistence(timeout: 10))
        let settings = app.buttons["slider.horizontal.3"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        XCTAssertTrue(app.staticTexts["Ortung"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["AR"].exists)
        save(app, "pilot-settings")
        app.buttons["Fertig"].tap()
        XCUIDevice.shared.press(.home)
        save(XCUIApplication(bundleIdentifier: "com.apple.springboard"), "app-icon")
        save(app, "map-overview")
    }
    private func save(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a)
    }
}
