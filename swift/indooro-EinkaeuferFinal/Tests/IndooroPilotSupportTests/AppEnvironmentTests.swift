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
    func testArrivalTuningAcceptsOnlyPositiveFiniteNumbers() {
        XCTAssertEqual(AppEnvironment.parsePositiveSetting("2.5"), 2.5)
        XCTAssertEqual(AppEnvironment.parsePositiveSetting(" 4 "), 4)
        for value in [nil, "", "abc", "0", "-1", "nan", "inf", "1,5"] as [String?] {
            XCTAssertNil(AppEnvironment.parsePositiveSetting(value), "\(String(describing: value))")
        }
    }
    func testArrivalTuningReadsBothKeysAndIgnoresInvalidOnes() {
        let both = AppEnvironment.arrivalSuggestionTuning(environment: [
            "INDOORO_ARRIVAL_RADIUS_M": "4",
            "INDOORO_ARRIVAL_DWELL_S": "2.5",
        ])
        XCTAssertEqual(both, AppEnvironment.ArrivalSuggestionTuning(radiusMeters: 4, dwellSeconds: 2.5))

        let invalid = AppEnvironment.arrivalSuggestionTuning(environment: [
            "INDOORO_ARRIVAL_RADIUS_M": "0",
            "INDOORO_ARRIVAL_DWELL_S": "-3",
        ])
        XCTAssertEqual(invalid, AppEnvironment.ArrivalSuggestionTuning(radiusMeters: nil, dwellSeconds: nil))
        XCTAssertEqual(AppEnvironment.arrivalSuggestionTuning(environment: [:]),
                       AppEnvironment.ArrivalSuggestionTuning(radiusMeters: nil, dwellSeconds: nil))
    }
    func testSessionBoundsTimeouts() {
        XCTAssertEqual(AppEnvironment.session.configuration.timeoutIntervalForRequest, 15)
        XCTAssertEqual(AppEnvironment.session.configuration.timeoutIntervalForResource, 15)
    }
}
