import XCTest
@testable import IndooroNetworking

/// Prueft die URL-Bildung der Produktabfragen (Suche, Liste, Produkt per ID) inkl. `storeCode`.
/// Reine String-/URL-Tests, kein Netzwerk.
final class ProductEndpointTests: XCTestCase {
    private let base = "https://example.test/api"

    // MARK: - Suche

    func testSearchWithoutStoreCodeKeepsLegacyURL() {
        let url = ProductEndpoint.searchURL(base: base, query: "milch", size: 50, storeCode: nil)

        XCTAssertEqual(url?.absoluteString, "https://example.test/api/products/search?q=milch&size=50")
    }

    func testEmptyAndWhitespaceStoreCodeAreOmitted() {
        let withoutCode = ProductEndpoint.searchURL(base: base, query: "milch", size: 50, storeCode: nil)

        XCTAssertEqual(ProductEndpoint.searchURL(base: base, query: "milch", size: 50, storeCode: ""), withoutCode)
        XCTAssertEqual(ProductEndpoint.searchURL(base: base, query: "milch", size: 50, storeCode: "  "), withoutCode)
        XCTAssertFalse(withoutCode?.absoluteString.contains("storeCode") ?? true)
    }

    func testSearchAppendsStoreCodeAsLastParameter() {
        let url = ProductEndpoint.searchURL(base: base, query: "milch", size: 50, storeCode: "SPAR-001")

        XCTAssertEqual(url?.absoluteString, "https://example.test/api/products/search?q=milch&size=50&storeCode=SPAR-001")
        XCTAssertEqual(url?.absoluteString.components(separatedBy: "storeCode=").count, 2,
                       "storeCode darf genau einmal vorkommen")
    }

    func testStoreCodeIsTrimmed() {
        let url = ProductEndpoint.searchURL(base: base, query: "milch", size: 50, storeCode: "  SPAR-001 \n")

        XCTAssertTrue(url?.absoluteString.hasSuffix("&storeCode=SPAR-001") ?? false)
    }

    func testStoreCodeWithSpecialCharactersIsPercentEncoded() {
        let url = ProductEndpoint.searchURL(base: base, query: "milch", size: 50, storeCode: "SPAR Leonding/001")

        XCTAssertEqual(
            url?.absoluteString,
            "https://example.test/api/products/search?q=milch&size=50&storeCode=SPAR%20Leonding%2F001"
        )
    }

    func testStoreCodeCannotInjectParameters() {
        let url = ProductEndpoint.searchURL(base: base, query: "milch", size: 50, storeCode: "A&size=1=B")

        XCTAssertEqual(
            url?.absoluteString,
            "https://example.test/api/products/search?q=milch&size=50&storeCode=A%26size%3D1%3DB"
        )
    }

    func testUnreservedStoreCodeCharactersAreKept() {
        let url = ProductEndpoint.searchURL(base: base, query: "milch", size: 50, storeCode: "a-b._~9")

        XCTAssertTrue(url?.absoluteString.hasSuffix("&storeCode=a-b._~9") ?? false)
    }

    func testQueryEncodingKeepsSpacesAndUmlauts() {
        let url = ProductEndpoint.searchURL(base: base, query: "Bio Milch äöü", size: 50, storeCode: "SPAR")

        XCTAssertEqual(
            url?.absoluteString,
            "https://example.test/api/products/search?q=Bio%20Milch%20%C3%A4%C3%B6%C3%BC&size=50&storeCode=SPAR"
        )
    }

    func testQueryCannotInjectParameters() {
        let url = ProductEndpoint.searchURL(base: base, query: "Milch&storeCode=B+x=1#", size: 50, storeCode: "A")
        XCTAssertEqual(
            url?.absoluteString,
            "https://example.test/api/products/search?q=Milch%26storeCode%3DB%2Bx%3D1%23&size=50&storeCode=A"
        )
        let items = URLComponents(url: url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(items.filter { $0.name == "storeCode" }.map(\.value), ["A"])
        XCTAssertEqual(items.first { $0.name == "q" }?.value, "Milch&storeCode=B+x=1#")
    }

    func testSearchSizeIsClampedToOne() {
        let url = ProductEndpoint.searchURL(base: base, query: "milch", size: 0, storeCode: nil)

        XCTAssertEqual(url?.absoluteString, "https://example.test/api/products/search?q=milch&size=1")
    }

    // MARK: - Liste

    func testListWithoutStoreCode() {
        let url = ProductEndpoint.listURL(base: base, size: 500, storeCode: nil)

        XCTAssertEqual(url?.absoluteString, "https://example.test/api/products?size=500")
    }

    func testListWithStoreCodeAppendsLast() {
        let url = ProductEndpoint.listURL(base: base, size: 500, storeCode: "SPAR-001")

        XCTAssertEqual(url?.absoluteString, "https://example.test/api/products?size=500&storeCode=SPAR-001")
    }

    func testListSizeIsClampedToOne() {
        let url = ProductEndpoint.listURL(base: base, size: -3, storeCode: nil)

        XCTAssertEqual(url?.absoluteString, "https://example.test/api/products?size=1")
    }

    // MARK: - Produkt per ID

    func testProductByIdWithoutStoreCode() {
        let url = ProductEndpoint.productURL(base: base, id: 92, storeCode: nil)

        XCTAssertEqual(url?.absoluteString, "https://example.test/api/products/92")
    }

    func testProductByIdWithStoreCodeUsesQueryMark() {
        let url = ProductEndpoint.productURL(base: base, id: 92, storeCode: "SPAR-001")

        XCTAssertEqual(url?.absoluteString, "https://example.test/api/products/92?storeCode=SPAR-001")
    }

    // MARK: - normalizedStoreCode

    func testNormalizedStoreCode() {
        XCTAssertNil(ProductEndpoint.normalizedStoreCode(nil))
        XCTAssertNil(ProductEndpoint.normalizedStoreCode(""))
        XCTAssertNil(ProductEndpoint.normalizedStoreCode(" \t\n"))
        XCTAssertEqual(ProductEndpoint.normalizedStoreCode(" SPAR-001 "), "SPAR-001")
    }
}
