import XCTest

final class StudySmoke: XCTestCase {
    private func openSettings() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "at.ac.htl.leonding.indooroswift2")
        app.launchEnvironment["INDOORO_API_BASE_URL"] = "https://127.0.0.1:1/api"
        app.launchArguments = ["-IndooroIntroductionCompleted", "YES"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Karte"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Karte"].tap()
        XCTAssertTrue(app.staticTexts["SPAR-Filialen"].waitForExistence(timeout: 10))
        app.buttons["slider.horizontal.3"].tap()
        XCTAssertTrue(app.staticTexts["Ortung"].waitForExistence(timeout: 8))
        return app
    }
    func testStudyIsHiddenForCustomer() {
        let app = openSettings()
        XCTAssertFalse(app.buttons["Testleitung"].exists)
        save(app, "study-off-settings")
    }
    func testThreeSyntheticTasksAndLocalExport() {
        continueAfterFailure = false
        let app = openSettings()
        XCTAssertTrue(app.buttons["Testleitung"].waitForExistence(timeout: 5))
        app.buttons["Testleitung"].tap()
        XCTAssertTrue(app.navigationBars["Testleitung"].waitForExistence(timeout: 10))
        let id = app.textFields["Test-ID"]
        id.tap(); id.typeText("Anna")
        XCTAssertFalse(app.buttons["Sitzung starten"].isEnabled)
        // Clear using the text field's current character count.
        id.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 4) + "T01\n")
        app.buttons["Sitzung starten"].tap()
        XCTAssertTrue(app.staticTexts["Aktive Sitzung: T01"].waitForExistence(timeout: 8))
        save(app, "study-session")
        for no in 1...3 {
            app.buttons["study.start.\(no)"].tap()
            if no != 3 {
                let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.navigationBars["Testleitung"])
                XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 10), .completed)
            }
            let outcome = no == 2 ? "Hilfe gebraucht" : "Gefunden"
            XCTAssertTrue(app.buttons[outcome].firstMatch.waitForExistence(timeout: 10))
            if no == 1 { save(app, "study-running-map") }
            app.buttons[outcome].firstMatch.tap()
            if no != 3 {
                app.buttons["Testleitung"].firstMatch.tap()
                XCTAssertTrue(app.navigationBars["Testleitung"].waitForExistence(timeout: 10))
            }
        }
        app.swipeUp()
        app.buttons["Export vorbereiten"].tap()
        XCTAssertTrue(app.buttons["CSV und Ereignisse teilen"].waitForExistence(timeout: 5))
        save(app, "study-export")
        app.buttons["CSV und Ereignisse teilen"].tap()
        save(app, "study-share-sheet")
    }
    private func save(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a)
    }
}
