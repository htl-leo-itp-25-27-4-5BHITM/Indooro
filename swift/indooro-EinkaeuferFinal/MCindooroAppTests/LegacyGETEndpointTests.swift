import IndooroNetworking
import XCTest
@testable import MCindooroApp

/// `LegacyGETEndpoint` muss aus den URLs, die `BeaconManager` baut, exakt dieselbe Anfrage wie vorher erzeugen.
final class LegacyGETEndpointTests: XCTestCase {
    private let base = URL(string: "https://example.test/api")!

    private func rebuilt(_ urlString: String) throws -> URLRequest {
        let endpoint = try XCTUnwrap(LegacyGETEndpoint(url: URL(string: urlString)!, base: base))
        return try endpoint.urlRequest(environment: APIEnvironment(baseURL: base))
    }

    func testPlainPathRoundTrips() throws {
        let request = try rebuilt("https://example.test/api/mobile/stores")
        XCTAssertEqual(request.url?.absoluteString, "https://example.test/api/mobile/stores")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.timeoutInterval, AppEnvironment.requestTimeout)
    }

    func testQueryRoundTrips() throws {
        let request = try rebuilt("https://example.test/api/mobile/stores/by-beacon?uuid=AB-CD&major=1&minor=2")
        XCTAssertEqual(request.url?.absoluteString, "https://example.test/api/mobile/stores/by-beacon?uuid=AB-CD&major=1&minor=2")
    }

    func testPercentEncodedPathSegmentStaysEncoded() throws {
        let request = try rebuilt("https://example.test/api/layout/versions/a%20b%2Fc")
        XCTAssertEqual(request.url?.absoluteString, "https://example.test/api/layout/versions/a%20b%2Fc")
    }

    func testBaseWithTrailingSlashAndForeignHost() {
        XCTAssertNotNil(LegacyGETEndpoint(url: URL(string: "https://example.test/api/layout/current")!, base: URL(string: "https://example.test/api/")!))
        XCTAssertNil(LegacyGETEndpoint(url: URL(string: "https://other.test/api/layout/current")!, base: base))
    }

    func testNeverRetries() {
        let endpoint = LegacyGETEndpoint(path: "/layout/current")
        XCTAssertEqual(endpoint.retry, .none)
    }
}
