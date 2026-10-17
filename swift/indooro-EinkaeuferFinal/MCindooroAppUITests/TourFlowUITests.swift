import XCTest

/// Tour: Produkte planen, Store öffnen, Tour starten, Stopp erledigen (add-ios-pilot-ui-tests 3.2).
final class TourFlowUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
    }

    func testTourStartsAtEntranceAndRoutesFromLastStopAfterDone() {
        let app = UITestSupport.launchApp()

        // Drei Produkte aus drei verschiedenen Regalen, damit die Tour drei Stopps hat.
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

        // Die Tour öffnet die Karte; der erste Stopp wird ab dem Eingang angefahren.
        // Der Karte-Tab zeigt nach dem Tour-Start wieder die Filialübersicht; der Store ist schon aktiv,
        // ein Tap auf die Filialkarte öffnet das Layout mit der Tour.
        UITestSupport.openStoreIfOverviewShown(in: app)
        XCTAssertTrue(
            app.staticTexts["Route ab Eingang"].waitForExistence(timeout: UITestSupport.timeout),
            "„Route ab Eingang“ erscheint nicht nach dem Tour-Start"
        )

        let done = app.buttons["Erledigt"]
        XCTAssertTrue(done.waitForExistence(timeout: UITestSupport.timeout), "„Erledigt“ fehlt in der Tour")
        done.tap()

        // Nach „Erledigt“ startet die Route vom verlassenen Stopp; der Name ist ein Regal des Layouts.
        let fromStop = app.staticTexts
            .matching(NSPredicate(format: "label BEGINSWITH %@ AND label != %@", "Route ab ", "Route ab Eingang"))
            .firstMatch
        XCTAssertTrue(fromStop.waitForExistence(timeout: UITestSupport.timeout), "„Route ab <Stopp>“ erscheint nicht")
        let stopName = String(fromStop.label.dropFirst("Route ab ".count))
        XCTAssertTrue(
            UITestSupport.shelfLabels.contains(stopName),
            "Der Startpunkt „\(stopName)“ ist kein Regalname des Testlayouts"
        )
    }
}
