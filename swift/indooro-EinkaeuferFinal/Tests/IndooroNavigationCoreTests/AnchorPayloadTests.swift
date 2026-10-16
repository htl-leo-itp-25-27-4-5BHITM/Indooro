import XCTest
import simd
@testable import IndooroNavigationCore

final class AnchorPayloadTests: XCTestCase {
    private func element(
        id: Int64,
        type: String,
        anchorId: String? = nil,
        x: Double,
        y: Double,
        width: Double? = nil,
        height: Double? = nil
    ) throws -> LayoutElement {
        var json: [String: Any] = ["id": id, "type": type, "x": x, "y": y]
        if let anchorId { json["anchorId"] = anchorId }
        if let width { json["width"] = width }
        if let height { json["height"] = height }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try JSONDecoder().decode(LayoutElement.self, from: data)
    }

    // MARK: - Parsing

    func testParsesCanonicalURL() {
        let payload = AnchorPayload.parse("https://spar.example.at/customer/?store=EUROSPAR-Leonding-001&a=A12")
        XCTAssertEqual(payload, AnchorPayload(storeCode: "EUROSPAR-Leonding-001", anchorId: "A12"))
    }

    func testParsesHTTPAndPathWithoutTrailingSlash() {
        XCTAssertEqual(
            AnchorPayload.parse("http://localhost:3000/customer?store=S1&a=A1"),
            AnchorPayload(storeCode: "S1", anchorId: "A1")
        )
    }

    func testParsesStoreCodeWithUmlautsFromRawURL() {
        let payload = AnchorPayload.parse("https://spar.example.at/customer/?store=Spar-Hörsching-001&a=A7")
        XCTAssertEqual(payload, AnchorPayload(storeCode: "Spar-Hörsching-001", anchorId: "A7"))
    }

    func testParsesStoreCodeWithUmlautsFromPercentEncodedURL() {
        let payload = AnchorPayload.parse("https://spar.example.at/customer/?store=Spar-H%C3%B6rsching-001&a=A7")
        XCTAssertEqual(payload, AnchorPayload(storeCode: "Spar-Hörsching-001", anchorId: "A7"))
    }

    func testTrimsSurroundingWhitespace() {
        XCTAssertEqual(
            AnchorPayload.parse("  https://spar.example.at/customer/?store=S1&a=A1\n"),
            AnchorPayload(storeCode: "S1", anchorId: "A1")
        )
    }

    func testStoreCodeLengthBoundary() {
        let code64 = String(repeating: "S", count: 64)
        let code65 = String(repeating: "S", count: 65)
        XCTAssertNotNil(AnchorPayload.parse("https://h.at/customer/?store=\(code64)&a=A1"))
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/?store=\(code65)&a=A1"))
    }

    func testAnchorIdLengthBoundary() {
        XCTAssertNotNil(AnchorPayload.parse("https://h.at/customer/?store=S1&a=ABCDEFGHIJKL"))
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/?store=S1&a=ABCDEFGHIJKLM"))
    }

    func testRejectsLowercaseAnchorId() {
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/?store=S1&a=a12"))
    }

    func testRejectsAnchorIdWithInvalidCharacters() {
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/?store=S1&a=A_1"))
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/?store=S1&a=A%201"))
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/?store=S1&a=Ä1"))
    }

    func testRejectsMissingScheme() {
        XCTAssertNil(AnchorPayload.parse("spar.example.at/customer/?store=S1&a=A1"))
        XCTAssertNil(AnchorPayload.parse("//spar.example.at/customer/?store=S1&a=A1"))
    }

    func testRejectsOtherSchemes() {
        XCTAssertNil(AnchorPayload.parse("ftp://spar.example.at/customer/?store=S1&a=A1"))
        XCTAssertNil(AnchorPayload.parse("myapp://customer/?store=S1&a=A1"))
    }

    func testRejectsMissingHost() {
        XCTAssertNil(AnchorPayload.parse("https:///customer/?store=S1&a=A1"))
    }

    func testRejectsWrongPath() {
        XCTAssertNil(AnchorPayload.parse("https://h.at/shop/?store=S1&a=A1"))
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/extra?store=S1&a=A1"))
        XCTAssertNil(AnchorPayload.parse("https://h.at/?store=S1&a=A1"))
    }

    func testRejectsMissingStoreOrAnchor() {
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/?a=A1"))
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/?store=S1"))
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/"))
    }

    func testRejectsEmptyValues() {
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/?store=&a=A1"))
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/?store=S1&a="))
        XCTAssertNil(AnchorPayload.parse("https://h.at/customer/?store=%20%20&a=A1"))
    }

    func testRejectsNonURLText() {
        XCTAssertNil(AnchorPayload.parse(""))
        XCTAssertNil(AnchorPayload.parse("hallo welt"))
        XCTAssertNil(AnchorPayload.parse("A12"))
    }

    // MARK: - Building

    func testBuildsExpectedURL() {
        let payload = AnchorPayload(storeCode: "EUROSPAR-Leonding-001", anchorId: "A12")
        XCTAssertEqual(
            payload.url(host: "admin.example.at")?.absoluteString,
            "https://admin.example.at/customer/?store=EUROSPAR-Leonding-001&a=A12"
        )
    }

    func testBuildEncodesUmlautsAndReservedCharacters() throws {
        let payload = AnchorPayload(storeCode: "Spar-Hörsching&Co=1+2", anchorId: "A1")
        let url = try XCTUnwrap(payload.url(host: "admin.example.at"))
        let absolute = url.absoluteString

        XCTAssertFalse(absolute.contains("ö"))
        XCTAssertTrue(absolute.contains("%C3%B6"))
        XCTAssertTrue(absolute.contains("%26"))
        XCTAssertTrue(absolute.contains("%3D"))
        XCTAssertTrue(absolute.contains("%2B"))
        XCTAssertEqual(AnchorPayload.parse(absolute), payload)
    }

    func testRoundTripBuildAndParse() throws {
        let samples = [
            AnchorPayload(storeCode: "EUROSPAR-Leonding-001", anchorId: "A12"),
            AnchorPayload(storeCode: "Spar-Hörsching-001", anchorId: "GANG-4-ENDE"),
            AnchorPayload(storeCode: "ÄÖÜ ß", anchorId: "ABCDEFGHIJKL"),
            AnchorPayload(storeCode: String(repeating: "x", count: 64), anchorId: "Z9")
        ]
        for sample in samples {
            let url = try XCTUnwrap(sample.url(host: "h.example.at"))
            XCTAssertEqual(AnchorPayload.parse(url.absoluteString), sample, "Roundtrip fehlgeschlagen fuer \(sample.storeCode)")
        }
    }

    func testBuildRejectsInvalidParts() {
        XCTAssertNil(AnchorPayload(storeCode: "S1", anchorId: "a12").url(host: "h.at"))
        XCTAssertNil(AnchorPayload(storeCode: "", anchorId: "A1").url(host: "h.at"))
        XCTAssertNil(AnchorPayload(storeCode: "S1", anchorId: "A1").url(host: ""))
        XCTAssertNil(AnchorPayload(storeCode: "S1", anchorId: "A1").url(host: "h.at/evil"))
    }

    // MARK: - Resolve

    func testResolveInvalidText() throws {
        let anchors = [try element(id: 10, type: "anchor", anchorId: "A1", x: 1, y: 1)]
        XCTAssertEqual(AnchorPayload.resolve("kein code", activeStoreCode: "S1", anchors: anchors), .invalid)
        XCTAssertEqual(AnchorPayload.resolve("https://h.at/shop/?store=S1&a=A1", activeStoreCode: "S1", anchors: anchors), .invalid)
    }

    func testResolveStoreMismatch() throws {
        let anchors = [try element(id: 10, type: "anchor", anchorId: "A1", x: 1, y: 1)]
        XCTAssertEqual(
            AnchorPayload.resolve("https://h.at/customer/?store=Spar-Hörsching-001&a=A1", activeStoreCode: "EUROSPAR-Leonding-001", anchors: anchors),
            .storeMismatch(storeCode: "Spar-Hörsching-001")
        )
    }

    func testResolveWithoutActiveStoreIsMismatch() throws {
        let anchors = [try element(id: 10, type: "anchor", anchorId: "A1", x: 1, y: 1)]
        XCTAssertEqual(
            AnchorPayload.resolve("https://h.at/customer/?store=S1&a=A1", activeStoreCode: nil, anchors: anchors),
            .storeMismatch(storeCode: "S1")
        )
    }

    func testResolveStoreCodeComparisonIsCaseInsensitive() throws {
        let anchors = [try element(id: 10, type: "anchor", anchorId: "A1", x: 1, y: 1)]
        XCTAssertEqual(
            AnchorPayload.resolve("https://h.at/customer/?store=spar-hörsching-001&a=A1", activeStoreCode: "Spar-Hörsching-001", anchors: anchors),
            .setPosition(anchorId: "A1", point: SIMD2<Float>(1.5, 1.5))
        )
    }

    func testResolveUnknownAnchor() throws {
        let anchors = [try element(id: 10, type: "anchor", anchorId: "A1", x: 1, y: 1)]
        XCTAssertEqual(
            AnchorPayload.resolve("https://h.at/customer/?store=S1&a=A99", activeStoreCode: "S1", anchors: anchors),
            .unknownAnchor
        )
    }

    func testResolveIgnoresNonAnchorElementWithSameId() throws {
        let shelf = try element(id: 10, type: "shelf", anchorId: "A1", x: 1, y: 1)
        XCTAssertEqual(
            AnchorPayload.resolve("https://h.at/customer/?store=S1&a=A1", activeStoreCode: "S1", anchors: [shelf]),
            .unknownAnchor
        )
    }

    func testResolveReturnsCenterOfAnchor() throws {
        let anchors = [try element(id: 10, type: "anchor", anchorId: "A12", x: 10.5, y: 3, width: 1, height: 2)]
        XCTAssertEqual(
            AnchorPayload.resolve("https://h.at/customer/?store=S1&a=A12", activeStoreCode: "S1", anchors: anchors),
            .setPosition(anchorId: "A12", point: SIMD2<Float>(11, 4))
        )
    }

    func testResolveDefaultsSizeToOneMeter() throws {
        let anchors = [try element(id: 10, type: "anchor", anchorId: "A12", x: 10, y: 3)]
        XCTAssertEqual(
            AnchorPayload.resolve("https://h.at/customer/?store=S1&a=A12", activeStoreCode: "S1", anchors: anchors),
            .setPosition(anchorId: "A12", point: SIMD2<Float>(10.5, 3.5))
        )
    }
}
