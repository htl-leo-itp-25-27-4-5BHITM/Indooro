import XCTest
@testable import IndooroPilotSupport

final class PilotNetworkingTests: XCTestCase {
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
    func testDecoderAcceptsBothTimestampFormats() throws {
        struct Event: Decodable { let at: Date }
        for stamp in ["2026-10-16T12:00:00Z", "2026-10-16T12:00:00.123Z"] {
            XCTAssertNoThrow(try JSONDecoder.indooro.decode(Event.self, from: Data("{\"at\":\"\(stamp)\"}".utf8)))
        }
        XCTAssertThrowsError(try JSONDecoder.indooro.decode(Event.self, from: Data("{\"at\":\"yesterday\"}".utf8)))
    }
    func testLossyArrayConsumesInvalidNestedElements() throws {
        struct Item: Decodable { let id: Int }
        let data = Data("[{\"id\":1},null,{\"id\":\"bad\",\"nested\":[1,2]},[1,2],{\"id\":2}]".utf8)
        XCTAssertEqual(try JSONDecoder.indooro.decode(LossyDecodableArray<Item>.self, from: data).elements.map(\.id), [1, 2])
        XCTAssertThrowsError(try JSONDecoder.indooro.decode(LossyDecodableArray<Item>.self, from: Data("{}".utf8)))
    }
    func testHTTPFailureIsNotAnEmptySuccess() {
        let url = URL(string: "https://example.org/api")!
        XCTAssertNil(PilotHTTP.errorMessage(response: HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil), error: nil))
        XCTAssertTrue(PilotHTTP.errorMessage(response: HTTPURLResponse(url: url, statusCode: 503, httpVersion: nil, headerFields: nil), error: nil)?.contains("503") == true)
        XCTAssertNotNil(PilotHTTP.errorMessage(response: nil, error: URLError(.timedOut)))
        XCTAssertNotNil(PilotHTTP.errorMessage(response: nil, error: nil))
    }
}
