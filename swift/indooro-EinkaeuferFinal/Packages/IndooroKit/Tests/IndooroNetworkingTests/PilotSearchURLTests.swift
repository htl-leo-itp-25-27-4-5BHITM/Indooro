import Foundation
import XCTest
import IndooroNetworking

/// URL-Bildung der Produktsuche (vormals in IndooroPilotSupport, jetzt in IndooroNetworking).
final class PilotSearchURLTests: XCTestCase {
    func testQueryItemsRoundTripReservedCharactersAndStore() throws {
        let store = UUID()
        for query in ["Milch & Käse", "a+b", "50%", "#1", "Käse?", "a=b"] {
            let url = try XCTUnwrap(PilotSearchURL.make(base: URL(string: "https://example.org/api")!, query: query, size: 50, storeID: store, storeCode: "A&B+1"))
            let parts = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
            XCTAssertEqual(parts.path, "/api/products/search")
            XCTAssertEqual(parts.queryItems?.first(where: { $0.name == "q" })?.value, query)
            XCTAssertEqual(parts.queryItems?.first(where: { $0.name == "storeId" })?.value, store.uuidString)
            XCTAssertEqual(parts.queryItems?.first(where: { $0.name == "storeCode" })?.value, "A&B+1")
            XCTAssertEqual(parts.queryItems?.count, 4)
            XCTAssertFalse(url.absoluteString.contains("+"))
        }
    }
    func testCategoryURLAndSizeBound() throws {
        let url = try XCTUnwrap(PilotSearchURL.make(base: URL(string: "https://example.org/api")!, query: nil, size: 0, storeID: nil, storeCode: nil))
        XCTAssertEqual(url.path, "/api/products")
        XCTAssertEqual(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems, [URLQueryItem(name: "size", value: "1")])
    }

    // MARK: - Query-Kodierung der Suche

    func testSearchQueriesRoundTripAndReservedCharactersAreEncoded() throws {
        let base = URL(string: "https://example.org/api")!
        let cases: [(query: String, encoded: String)] = [
            ("Milch & Käse", "%26"),
            ("a+b", "%2B"),
            ("50%", "%25"),
            ("#1", "%23"),
        ]

        for (query, encoded) in cases {
            let url = try XCTUnwrap(PilotSearchURL.make(base: base, query: query, size: 50, storeID: nil, storeCode: nil))
            let parts = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
            let segments = try XCTUnwrap(parts.percentEncodedQuery?.components(separatedBy: "&"))

            XCTAssertEqual(parts.queryItems?.first(where: { $0.name == "q" })?.value, query, "Roundtrip für \(query)")
            XCTAssertFalse(url.absoluteString.contains("+"), "Kein rohes + in \(url.absoluteString)")
            XCTAssertEqual(segments.count, 2, "Nur size und q erwartet, kein zusätzliches & im q-Wert")
            let rawQ = try XCTUnwrap(segments.first(where: { $0.hasPrefix("q=") }))
            XCTAssertTrue(rawQ.contains(encoded), "\(query) sollte \(encoded) enthalten, ist \(rawQ)")
        }
    }
}
