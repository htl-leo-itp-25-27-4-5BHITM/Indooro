import XCTest
@testable import MCindooroApp

final class AppEnvironmentTests: XCTestCase {
    func testProfileSelectionFallsBackToPilot() {
        XCTAssertEqual(AppEnvironment.parseProfile(nil), .pilot)
        XCTAssertEqual(AppEnvironment.parseProfile("full"), .full)
        XCTAssertEqual(AppEnvironment.parseProfile("quatsch"), .pilot)
        XCTAssertEqual(AppEnvironment.parseProfile("full", override: "pilot"), .pilot)
        XCTAssertEqual(AppEnvironment.parseProfile("full", override: ""), .full)
    }

    func testAPIURLAcceptsOnlyPlainHTTPSAPIBase() {
        XCTAssertNotNil(AppEnvironment.parseAPIURL("https://example.org/api"))
        XCTAssertNil(AppEnvironment.parseAPIURL("https://u:p@example.org/api"))
        XCTAssertNil(AppEnvironment.parseAPIURL("https://example.org/other"))
        XCTAssertNil(AppEnvironment.parseAPIURL("ftp://example.org/api"))
    }

    func testSessionUsesRequestTimeout() {
        XCTAssertEqual(AppEnvironment.session.configuration.timeoutIntervalForRequest, AppEnvironment.requestTimeout)
    }

    func testStudyModeIsOffByDefault() {
        XCTAssertFalse(AppEnvironment.isStudyModeEnabled)
    }
}
