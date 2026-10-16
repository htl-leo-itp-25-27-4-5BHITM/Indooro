import XCTest
@testable import IndooroPilotSupport

final class AppEnvironmentTests: XCTestCase {
    func testMissingOrInvalidProfileDefaultsToPilot() {
        XCTAssertEqual(AppEnvironment.parseProfile(nil), .pilot)
        XCTAssertEqual(AppEnvironment.parseProfile("invalid"), .pilot)
    }
    func testFullAndExplicitOverride() {
        XCTAssertEqual(AppEnvironment.parseProfile("full"), .full)
        XCTAssertEqual(AppEnvironment.parseProfile("full", override: ""), .full)
        XCTAssertEqual(AppEnvironment.parseProfile("pilot", override: "full"), .full)
        XCTAssertEqual(AppEnvironment.parseProfile("full", override: "pilot"), .pilot)
        XCTAssertEqual(AppEnvironment.parseProfile("full", override: "invalid"), .pilot)
    }
    func testAPIRejectsCredentialsQueryAndUnexpectedPath() {
        for value in ["https://user:pass@example.org/api", "https://example.org/api?q=x", "https://example.org/other", "garbage"] {
            XCTAssertNil(AppEnvironment.parseAPIURL(value))
        }
        XCTAssertEqual(AppEnvironment.parseAPIURL("https://example.org/api/")?.absoluteString, "https://example.org/api")
    }
    func testSessionBoundsTimeouts() {
        XCTAssertEqual(AppEnvironment.session.configuration.timeoutIntervalForRequest, 15)
        XCTAssertEqual(AppEnvironment.session.configuration.timeoutIntervalForResource, 15)
    }
}
