import XCTest

final class LaunchSmokeUITests: XCTestCase {
    func testAppLaunchesAndShowsHome() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["Indooro"].waitForExistence(timeout: 15))
    }
}
