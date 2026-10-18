import XCTest
@testable import IndooroPilotSupport

final class PilotNetworkingTests: XCTestCase {
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
