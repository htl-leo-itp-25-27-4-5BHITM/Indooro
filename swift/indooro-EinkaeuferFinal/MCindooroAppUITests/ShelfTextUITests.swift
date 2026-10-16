import XCTest

/// Regaltext in Kundensprache statt des rohen layoutCode (add-ios-pilot-ui-tests 3.1 / Regaltext).
final class ShelfTextUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
    }

    func testPlannedProductShowsShelfTextInWords() {
        let app = UITestSupport.launchApp()

        UITestSupport.searchAndPlanFirstResult("Milch", in: app)

        // Trefferliste ausblenden: dort steht der Code als Hilfstext („Regal …“).
        UITestSupport.replaceText(in: app.textFields[UITestSupport.searchPlaceholder], with: "")

        let shelfText = app.staticTexts[UITestSupport.milkShelfLabel]
        XCTAssertTrue(shelfText.waitForExistence(timeout: UITestSupport.timeout), "Regaltext „\(UITestSupport.milkShelfLabel)“ fehlt in der Planung")
        XCTAssertEqual(
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "520/2/")).count,
            0,
            "Der rohe layoutCode ist in der Planung sichtbar"
        )

        // Dieselbe Beschriftung erscheint in der Einkaufsliste.
        UITestSupport.openTab("Einkaufen", in: app)
        XCTAssertTrue(
            app.descendants(matching: .any)
                .matching(NSPredicate(format: "label == %@", UITestSupport.milkShelfLabel))
                .firstMatch
                .waitForExistence(timeout: UITestSupport.timeout),
            "Regaltext fehlt in der Einkaufsliste"
        )
    }
}
