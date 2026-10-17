import XCTest

/// Barrierefreiheit: Dynamic Type (XXL), Tab-Leiste, Kartenzusammenfassung und Tippziele
/// (improve-ios-accessibility 3.1).
final class AccessibilityUITests: XCTestCase {
    private static let accessibilityXXL = "UICTContentSizeCategoryAccessibilityXXL"

    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
    }

    /// Planung bei der größten Schriftstufe: Suchfeld, Treffer und „Einplanen“ bleiben bedienbar.
    func testSearchAndPlanWorkAtAccessibilityXXL() {
        let app = UITestSupport.launchApp(contentSize: Self.accessibilityXXL)
        UITestSupport.openTab("Planung", in: app)

        let field = app.textFields[UITestSupport.searchPlaceholder]
        XCTAssertTrue(field.waitForExistence(timeout: UITestSupport.timeout), "Suchfeld der Planung fehlt")
        XCTAssertTrue(field.isHittable, "Suchfeld ist bei XXL nicht tippbar")
        UITestSupport.replaceText(in: field, with: "Milch")

        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "milch")).firstMatch
                .waitForExistence(timeout: UITestSupport.timeout),
            "Kein Suchtreffer mit „Milch“ bei XXL"
        )

        let addButton = app.buttons["Einplanen"].firstMatch
        XCTAssertTrue(addButton.waitForExistence(timeout: UITestSupport.timeout), "„Einplanen“ fehlt bei XXL")
        // Die Tastatur verdeckt sonst die Schaltfläche; vor dem Tippen schließen.
        UITestSupport.dismissKeyboardIfShown(in: app)
        scrollUntilHittable(addButton, in: app)
        XCTAssertTrue(addButton.isHittable, "„Einplanen“ ist bei XXL nicht tippbar")
        addButton.tap()

        // Der Zähler „1 Artikel offen“ liegt bei XXL oberhalb des sichtbaren Bereichs der Lazy-Liste;
        // der Treffer wechselt stattdessen auf „Noch eins“.
        XCTAssertTrue(
            app.buttons["Noch eins"].waitForExistence(timeout: UITestSupport.timeout),
            "Treffer zeigt nach dem Einplanen bei XXL nicht „Noch eins“"
        )
    }

    /// Alle Tabs der Tab-Leiste sind bei XXL sichtbar und tippbar. „Rezepte“ gibt es nur im Profil „full“.
    func testTabsAreHittableAtAccessibilityXXL() {
        let app = UITestSupport.launchApp(contentSize: Self.accessibilityXXL)
        XCTAssertTrue(app.tabBars.buttons["Karte"].waitForExistence(timeout: UITestSupport.timeout), "Tab-Leiste fehlt bei XXL")

        let hasRecipes = app.tabBars.buttons["Rezepte"].exists
        let titles = hasRecipes
            ? ["Start", "Planung", "Rezepte", "Einkaufen", "Karte"]
            : ["Start", "Planung", "Einkaufen", "Karte"]

        for title in titles {
            let tab = app.tabBars.buttons[title]
            XCTAssertTrue(tab.waitForExistence(timeout: UITestSupport.timeout), "Tab „\(title)“ fehlt bei XXL")
            XCTAssertTrue(tab.isHittable, "Tab „\(title)“ ist bei XXL nicht tippbar")
        }
    }

    /// Tour bei XXL: Kartenzusammenfassung für VoiceOver und das Tour-Panel mit „Erledigt“.
    func testMapSummaryAndTourPanelAtAccessibilityXXL() {
        let app = UITestSupport.launchApp(contentSize: Self.accessibilityXXL)
        UITestSupport.searchAndPlanFirstResult("Milch", in: app)
        XCTAssertTrue(
            app.buttons["Noch eins"].waitForExistence(timeout: UITestSupport.timeout),
            "Das Produkt ist nicht eingeplant"
        )

        UITestSupport.openStoreLayout(in: app)

        UITestSupport.openTab("Einkaufen", in: app)
        let startTour = app.buttons["Tour starten"]
        XCTAssertTrue(startTour.waitForExistence(timeout: UITestSupport.timeout), "„Tour starten“ fehlt")
        startTour.tap()

        UITestSupport.openStoreIfOverviewShown(in: app)
        XCTAssertTrue(
            app.staticTexts["Route ab Eingang"].waitForExistence(timeout: UITestSupport.timeout),
            "„Route ab Eingang“ erscheint nicht nach dem Tour-Start"
        )

        // Die Zusammenfassung ist ein eigenes Element mit Label; sie beginnt mit „Ziel:“ oder „Kein Ziel“.
        let summary = app.descendants(matching: .any).matching(identifier: "mapSummary").firstMatch
        XCTAssertTrue(summary.waitForExistence(timeout: UITestSupport.timeout), "Kartenzusammenfassung „mapSummary“ fehlt")
        let summaryReady = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Ziel:", "Kein Ziel"),
            object: summary
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [summaryReady], timeout: UITestSupport.timeout),
            .completed,
            "Kartenzusammenfassung beginnt weder mit „Ziel:“ noch mit „Kein Ziel“"
        )
        let summaryLabel = summary.label
        XCTAssertFalse(summaryLabel.isEmpty, "Kartenzusammenfassung hat kein Label")
        if summaryLabel.hasPrefix("Ziel:") {
            XCTAssertTrue(summaryLabel.contains("Route ab"), "Zusammenfassung „\(summaryLabel)“ nennt keine Route ab Start")
        }

        let panel = app.descendants(matching: .any).matching(identifier: "tourPanel").firstMatch
        XCTAssertTrue(panel.waitForExistence(timeout: UITestSupport.timeout), "Tour-Panel „tourPanel“ fehlt")

        let done = app.buttons["Erledigt"]
        XCTAssertTrue(done.waitForExistence(timeout: UITestSupport.timeout), "„Erledigt“ fehlt im Tour-Panel bei XXL")
        scrollUntilHittable(done, in: app)
        XCTAssertTrue(done.isHittable, "„Erledigt“ ist bei XXL nicht tippbar")
    }

    /// Bei Standardgröße hat das Einplanen-Ziel mindestens 44 × 44 pt.
    func testControlsHaveMinimumTouchTarget() {
        let app = UITestSupport.launchApp()
        UITestSupport.openTab("Planung", in: app)

        let field = app.textFields[UITestSupport.searchPlaceholder]
        XCTAssertTrue(field.waitForExistence(timeout: UITestSupport.timeout), "Suchfeld der Planung fehlt")
        UITestSupport.replaceText(in: field, with: "Milch")

        let addButton = app.buttons["Einplanen"].firstMatch
        XCTAssertTrue(addButton.waitForExistence(timeout: UITestSupport.timeout), "Keine Suchtreffer für „Milch“")
        let frame = addButton.frame
        XCTAssertGreaterThanOrEqual(frame.width, 44, "„Einplanen“ ist schmaler als 44 pt (\(frame.width) pt)")
        XCTAssertGreaterThanOrEqual(frame.height, 44, "„Einplanen“ ist niedriger als 44 pt (\(frame.height) pt)")
    }

    /// XXL schiebt Inhalte nach unten; hier wird nur so weit gewischt, bis das Element tippbar ist.
    private func scrollUntilHittable(_ element: XCUIElement, in app: XCUIApplication, maxSwipes: Int = 4) {
        var swipes = 0
        while !element.isHittable && swipes < maxSwipes {
            app.swipeUp()
            swipes += 1
        }
    }
}
