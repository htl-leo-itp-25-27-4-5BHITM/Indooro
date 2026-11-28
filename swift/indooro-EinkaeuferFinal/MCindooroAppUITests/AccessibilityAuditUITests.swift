import XCTest

/// Runs in the CI scheme against the deterministic mobile API fixture.
/// Only reproduced, element-specific false positives may be excluded below.
@available(iOS 17.0, *)
final class AccessibilityAuditUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
    }

    func testStartAccessibilityAudit() throws {
        let app = UITestSupport.launchApp()
        XCTAssertTrue(app.staticTexts["Indooro"].waitForExistence(timeout: UITestSupport.timeout))
        try audit(app)
    }

    func testStoreMapAccessibilityAudit() throws {
        let app = UITestSupport.launchApp()
        UITestSupport.openStoreLayout(in: app)
        XCTAssertTrue(app.descendants(matching: .any)["mapSummary"].waitForExistence(timeout: UITestSupport.timeout))
        try audit(app)
    }

    func testProductSearchAccessibilityAudit() throws {
        let app = UITestSupport.launchApp()
        UITestSupport.openTab("Planung", in: app)
        let field = app.textFields[UITestSupport.searchPlaceholder]
        XCTAssertTrue(field.waitForExistence(timeout: UITestSupport.timeout))
        UITestSupport.replaceText(in: field, with: "Milch")
        XCTAssertTrue(app.buttons["Einplanen"].firstMatch.waitForExistence(timeout: UITestSupport.timeout))
        UITestSupport.dismissKeyboardIfShown(in: app)
        try audit(app)
    }

    func testShoppingListAccessibilityAudit() throws {
        let app = UITestSupport.launchApp()
        UITestSupport.searchAndPlanFirstResult("Milch", in: app)
        XCTAssertTrue(app.buttons["Noch eins"].firstMatch.waitForExistence(timeout: UITestSupport.timeout))
        UITestSupport.openTab("Einkaufen", in: app)
        XCTAssertTrue(app.buttons["Tour starten"].waitForExistence(timeout: UITestSupport.timeout))
        try audit(app)
    }

    func testSettingsAccessibilityAudit() throws {
        let app = UITestSupport.launchApp()
        UITestSupport.openStoreLayout(in: app)
        let settings = app.buttons["Einstellungen"]
        XCTAssertTrue(settings.waitForExistence(timeout: UITestSupport.timeout))
        settings.tap()
        XCTAssertTrue(app.navigationBars["Einstellungen"].waitForExistence(timeout: UITestSupport.timeout))
        try audit(app)
    }

    func testOnboardingAccessibilityAudit() throws {
        let app = UITestSupport.launchApp(introductionCompleted: false)
        XCTAssertTrue(app.staticTexts["Willkommen bei Indooro"].waitForExistence(timeout: UITestSupport.timeout))
        try audit(app)
        // The start tab has its own "Los geht's" button behind the sheet, so tap the hittable one.
        app.buttons.matching(NSPredicate(format: "label == %@ AND hittable == true", "Los geht's")).firstMatch.tap()
        XCTAssertTrue(app.tabBars.buttons["Start"].waitForExistence(timeout: UITestSupport.timeout))
    }

    private func audit(_ app: XCUIApplication) throws {
        // Collect every finding in a screen, even when an earlier issue fails XCTest.
        continueAfterFailure = true
        defer { continueAfterFailure = false }
        try app.performAccessibilityAudit(for: .all) { issue in
            print("AUDIT \(self.name) | \(issue.auditType.rawValue) | \(issue.compactDescription) | \(issue.element?.debugDescription ?? "nil")")
            if self.name.contains("testProductSearchAccessibilityAudit"),
               issue.auditType == .contrast,
               issue.element?.label == "Suchergebnisse" {
                // Run 46135081559: the screenshot shows this scrolled section header behind
                // iOS 26's navigation-bar Liquid Glass blur. The unobscured header uses the
                // system list text color; the reported contrast belongs to system chrome.
                return true
            }
            return false
        }
    }
}
