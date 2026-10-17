import XCTest

/// Offline-Start: Store-Layout kommt aus der lokalen Offline-Kopie (add-ios-pilot-ui-tests 3.4).
final class OfflineStartUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
    }

    func testOfflineStartOpensStoreFromOfflineCopy() {
        // Erster Start online: Store laden, damit eine Offline-Kopie entsteht.
        let online = UITestSupport.launchApp()
        UITestSupport.openStoreLayout(in: online)
        online.terminate()

        // Zweiter Start ohne erreichbare API.
        let offline = UITestSupport.launchApp(apiBase: UITestSupport.unreachableAPIBase)
        UITestSupport.openTab("Karte", in: offline)

        XCTAssertTrue(
            UITestSupport.storeMap(in: offline).waitForExistence(timeout: UITestSupport.timeout),
            "Karte startet nicht offline"
        )
        XCTAssertTrue(
            offline.staticTexts[UITestSupport.storeName].waitForExistence(timeout: UITestSupport.timeout),
            "Offline-Store „\(UITestSupport.storeName)“ fehlt in der Kopfzeile"
        )
        let copyNote = offline.staticTexts
            .matching(NSPredicate(format: "label CONTAINS %@", "Offline-Kopie"))
            .firstMatch
        XCTAssertTrue(copyNote.waitForExistence(timeout: UITestSupport.timeout), "Hinweis „Offline-Kopie“ fehlt")
    }
}
