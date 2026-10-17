import XCTest

/// Produktsuche in der Planung: Sonderzeichen im Suchbegriff, Tippfehler und Suchen ohne Treffer
/// (add-ios-pilot-ui-tests 3.1).
final class SearchUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
    }

    /// „&“ muss als Zeichen übertragen werden; vorher schnitt die Suche bei „&“ ab und lieferte alle Milchprodukte.
    func testAmpersandQueryFindsOnlyTheMatchingProduct() {
        let app = UITestSupport.launchApp()
        UITestSupport.openTab("Planung", in: app)

        let field = app.textFields[UITestSupport.searchPlaceholder]
        XCTAssertTrue(field.waitForExistence(timeout: UITestSupport.timeout), "Suchfeld der Planung fehlt")
        UITestSupport.replaceText(in: field, with: "Milch & Käse")

        XCTAssertTrue(
            app.staticTexts["Milch & Käse Frühstücksbox 300g"].waitForExistence(timeout: UITestSupport.timeout),
            "Das Produkt „Milch & Käse Frühstücksbox 300g“ erscheint nicht in den Treffern"
        )
        XCTAssertFalse(app.staticTexts["Frischmilch 1L"].exists, "„Frischmilch 1L“ darf bei „Milch & Käse“ nicht erscheinen")
        XCTAssertEqual(
            app.buttons.matching(NSPredicate(format: "label == %@", "Einplanen")).count,
            1,
            "Es soll genau ein einplanbarer Treffer erscheinen"
        )
    }

    /// Tippfehler ergibt keinen Treffer: Hinweis sichtbar, keine Schaltfläche „Einplanen“.
    func testTypoShowsNoResultHintWithoutAddButton() {
        let app = UITestSupport.launchApp()
        UITestSupport.openTab("Planung", in: app)

        let field = app.textFields[UITestSupport.searchPlaceholder]
        XCTAssertTrue(field.waitForExistence(timeout: UITestSupport.timeout), "Suchfeld der Planung fehlt")
        UITestSupport.replaceText(in: field, with: "Milsch")

        XCTAssertTrue(
            app.staticTexts["Keine Treffer für „Milsch“"].waitForExistence(timeout: UITestSupport.timeout),
            "Hinweis „Keine Treffer für „Milsch““ fehlt"
        )
        XCTAssertFalse(app.buttons["Einplanen"].exists, "Ohne Treffer darf keine Schaltfläche „Einplanen“ erscheinen")
    }

    /// Sonderzeichen ohne Treffer (hier „+“) führen zu einem Hinweis und nicht zu einem Absturz.
    func testPlusQueryWithoutResultsShowsHintAndDoesNotCrash() {
        let app = UITestSupport.launchApp()
        UITestSupport.openTab("Planung", in: app)

        let field = app.textFields[UITestSupport.searchPlaceholder]
        XCTAssertTrue(field.waitForExistence(timeout: UITestSupport.timeout), "Suchfeld der Planung fehlt")
        UITestSupport.replaceText(in: field, with: "a+b")

        XCTAssertTrue(
            app.staticTexts["Keine Treffer für „a+b“"].waitForExistence(timeout: UITestSupport.timeout),
            "Hinweis „Keine Treffer für „a+b““ fehlt"
        )
        XCTAssertFalse(app.buttons["Einplanen"].exists, "Ohne Treffer darf keine Schaltfläche „Einplanen“ erscheinen")
        XCTAssertEqual(app.state, .runningForeground, "Die App ist nach der Suche mit „+“ nicht mehr im Vordergrund")
    }
}
