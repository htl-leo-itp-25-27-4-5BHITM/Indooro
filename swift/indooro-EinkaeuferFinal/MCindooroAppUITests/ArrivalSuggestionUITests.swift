import XCTest

/// Ankunftsvorschlag im Modus „Ohne Ortung“: kein Vorschlag, „Erledigt“ funktioniert unveraendert.
final class ArrivalSuggestionUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
    }

    func testNoArrivalSuggestionWithoutPositioningAndErledigtStillCompletesStop() {
        let app = UITestSupport.launchApp()

        UITestSupport.searchAndPlanFirstResult("Milch", in: app)
        UITestSupport.searchAndPlanFirstResult("Bananen", in: app)
        UITestSupport.searchAndPlanFirstResult("Brot", in: app)
        XCTAssertTrue(
            app.staticTexts["3 Artikel offen"].waitForExistence(timeout: UITestSupport.timeout),
            "Die drei Produkte sind nicht alle eingeplant"
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

        // Ohne Ortung gibt es keinen Ankunftsvorschlag (kurze Negativpruefung).
        let suggestion = app.descendants(matching: .any).matching(identifier: "arrivalSuggestion").firstMatch
        XCTAssertFalse(suggestion.waitForExistence(timeout: 2), "Ankunftsvorschlag erscheint ohne Ortung")

        let done = app.buttons["Erledigt"]
        XCTAssertTrue(done.waitForExistence(timeout: UITestSupport.timeout), "„Erledigt“ fehlt in der Tour")
        done.tap()

        let fromStop = app.staticTexts
            .matching(NSPredicate(format: "label BEGINSWITH %@ AND label != %@", "Route ab ", "Route ab Eingang"))
            .firstMatch
        XCTAssertTrue(fromStop.waitForExistence(timeout: UITestSupport.timeout), "„Route ab <Stopp>“ erscheint nicht")
    }
}
