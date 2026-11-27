import XCTest

/// Runs in the CI scheme against the deterministic mobile API fixture.
/// No issues are suppressed: any future false positive needs an element-specific
/// filter, a reproduced finding, and a documented reason here.
@available(iOS 17.0, *)
final class AccessibilityAuditUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
    }

    func testStartAccessibilityAudit() throws {
        let app = UITestSupport.launchApp()
        XCTAssertTrue(app.staticTexts["Indooro"].waitForExistence(timeout: UITestSupport.timeout))
        try app.performAccessibilityAudit { i in print("AUDITDBG \(i.auditType.rawValue) | \(i.compactDescription) | \(i.element?.debugDescription.prefix(300) ?? "nil")"); return false }
    }

    func testStoreMapAccessibilityAudit() throws {
        let app = UITestSupport.launchApp()
        UITestSupport.openStoreLayout(in: app)
        XCTAssertTrue(app.descendants(matching: .any)["mapSummary"].waitForExistence(timeout: UITestSupport.timeout))
        try app.performAccessibilityAudit { i in print("AUDITDBG \(i.auditType.rawValue) | \(i.compactDescription) | \(i.element?.debugDescription.prefix(300) ?? "nil")"); return false }
    }

    func testProductSearchAccessibilityAudit() throws {
        let app = UITestSupport.launchApp()
        UITestSupport.openTab("Planung", in: app)
        let field = app.textFields[UITestSupport.searchPlaceholder]
        XCTAssertTrue(field.waitForExistence(timeout: UITestSupport.timeout))
        UITestSupport.replaceText(in: field, with: "Milch")
        XCTAssertTrue(app.buttons["Einplanen"].firstMatch.waitForExistence(timeout: UITestSupport.timeout))
        UITestSupport.dismissKeyboardIfShown(in: app)
        try app.performAccessibilityAudit { i in print("AUDITDBG \(i.auditType.rawValue) | \(i.compactDescription) | \(i.element?.debugDescription.prefix(300) ?? "nil")"); return false }
    }

    func testShoppingListAccessibilityAudit() throws {
        let app = UITestSupport.launchApp()
        UITestSupport.searchAndPlanFirstResult("Milch", in: app)
        XCTAssertTrue(app.buttons["Noch eins"].firstMatch.waitForExistence(timeout: UITestSupport.timeout))
        UITestSupport.openTab("Einkaufen", in: app)
        XCTAssertTrue(app.buttons["Tour starten"].waitForExistence(timeout: UITestSupport.timeout))
        try app.performAccessibilityAudit { i in print("AUDITDBG \(i.auditType.rawValue) | \(i.compactDescription) | \(i.element?.debugDescription.prefix(300) ?? "nil")"); return false }
    }

    func testSettingsAccessibilityAudit() throws {
        let app = UITestSupport.launchApp()
        UITestSupport.openStoreLayout(in: app)
        let settings = app.buttons["Einstellungen"]
        XCTAssertTrue(settings.waitForExistence(timeout: UITestSupport.timeout))
        settings.tap()
        XCTAssertTrue(app.navigationBars["Einstellungen"].waitForExistence(timeout: UITestSupport.timeout))
        try app.performAccessibilityAudit { i in print("AUDITDBG \(i.auditType.rawValue) | \(i.compactDescription) | \(i.element?.debugDescription.prefix(300) ?? "nil")"); return false }
    }

    func testOnboardingAccessibilityAudit() throws {
        let app = UITestSupport.launchApp(introductionCompleted: false)
        XCTAssertTrue(app.staticTexts["Willkommen bei Indooro"].waitForExistence(timeout: UITestSupport.timeout))
        try app.performAccessibilityAudit { i in print("AUDITDBG \(i.auditType.rawValue) | \(i.compactDescription) | \(i.element?.debugDescription.prefix(300) ?? "nil")"); return false }
        // The start tab has its own "Los geht's" button behind the sheet, so tap the hittable one.
        app.buttons.matching(NSPredicate(format: "label == %@ AND hittable == true", "Los geht's")).firstMatch.tap()
        XCTAssertTrue(app.tabBars.buttons["Start"].waitForExistence(timeout: UITestSupport.timeout))
    }
}
