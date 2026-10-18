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

    func testBaseURLDefaultsToLeoCloudWhenInfoPlistIsEmpty() {
        let leoCloud = URL(string: "https://it220209.cloud.htl-leonding.ac.at/api")
        XCTAssertEqual(AppEnvironment.resolveAPIBaseURL(infoPlistValue: nil, environmentValue: nil, isDebugBuild: false), leoCloud)
        XCTAssertEqual(AppEnvironment.resolveAPIBaseURL(infoPlistValue: "", environmentValue: nil, isDebugBuild: true), leoCloud)
        XCTAssertEqual(AppEnvironment.resolveAPIBaseURL(infoPlistValue: "$(INDOORO_API_BASE_URL)", environmentValue: nil, isDebugBuild: true), leoCloud)
        XCTAssertEqual(AppEnvironment.defaultAPI, leoCloud)
    }

    func testBaseURLUsesInfoPlistValue() {
        XCTAssertEqual(
            AppEnvironment.resolveAPIBaseURL(infoPlistValue: "http://localhost:8080/api", environmentValue: nil, isDebugBuild: false),
            URL(string: "http://localhost:8080/api")
        )
    }

    func testDebugEnvironmentOverridesInfoPlistValue() {
        XCTAssertEqual(
            AppEnvironment.resolveAPIBaseURL(infoPlistValue: "https://it220209.cloud.htl-leonding.ac.at/api",
                                             environmentValue: "http://127.0.0.1:18090/api", isDebugBuild: true),
            URL(string: "http://127.0.0.1:18090/api")
        )
    }

    func testReleaseIgnoresEnvironmentOverride() {
        XCTAssertEqual(
            AppEnvironment.resolveAPIBaseURL(infoPlistValue: "https://it220209.cloud.htl-leonding.ac.at/api",
                                             environmentValue: "http://127.0.0.1:18090/api", isDebugBuild: false),
            URL(string: "https://it220209.cloud.htl-leonding.ac.at/api")
        )
    }

    func testInvalidDebugOverrideFallsBackToInfoPlistValue() {
        XCTAssertEqual(
            AppEnvironment.resolveAPIBaseURL(infoPlistValue: "http://localhost:8080/api",
                                             environmentValue: "ftp://example.org/api", isDebugBuild: true),
            URL(string: "http://localhost:8080/api")
        )
    }

    func testSessionUsesRequestTimeout() {
        XCTAssertEqual(AppEnvironment.session.configuration.timeoutIntervalForRequest, AppEnvironment.requestTimeout)
    }

    func testStudyModeIsOffByDefault() {
        XCTAssertFalse(AppEnvironment.isStudyModeEnabled)
    }
}
