import XCTest
@testable import IndooroModels

/// Normalisierung von Beacon-UUIDs aus Layouts, Filial-Katalogen und Identitaetsschluesseln.
final class BeaconUUIDNormalizerTests: XCTestCase {

    private let canonical = "ad61389a-7486-48fa-afa2-9b5e4132f6a8"

    func testCanonicalUUIDIsLowercased() {
        XCTAssertEqual(
            BeaconUUIDNormalizer.normalizedUUIDString(from: "AD61389A-7486-48FA-AFA2-9B5E4132F6A8"),
            canonical
        )
    }

    func testBracesAndSurroundingWhitespaceAreIgnored() {
        XCTAssertEqual(
            BeaconUUIDNormalizer.normalizedUUIDString(from: "  {ad61389a-7486-48fa-afa2-9b5e4132f6a8} \n"),
            canonical
        )
    }

    func testCompactHexWithoutDashesIsFormatted() {
        XCTAssertEqual(
            BeaconUUIDNormalizer.normalizedUUIDString(from: "ad61389a748648faafa29b5e4132f6a8"),
            canonical
        )
    }

    func testInvalidValuesReturnNil() {
        XCTAssertNil(BeaconUUIDNormalizer.normalizedUUIDString(from: ""))
        XCTAssertNil(BeaconUUIDNormalizer.normalizedUUIDString(from: "   "))
        XCTAssertNil(BeaconUUIDNormalizer.normalizedUUIDString(from: "beacon-1"))
        // 31 Hex-Zeichen statt 32.
        XCTAssertNil(BeaconUUIDNormalizer.normalizedUUIDString(from: "ad61389a-7486-48fa-afa2-9b5e4132f6a"))
        // Nicht-hexadezimale Zeichen.
        XCTAssertNil(BeaconUUIDNormalizer.normalizedUUIDString(from: "zz61389a-7486-48fa-afa2-9b5e4132f6a8"))
    }

    func testUUIDFromOptionalValue() {
        XCTAssertEqual(BeaconUUIDNormalizer.uuid(from: "AD61389A-7486-48FA-AFA2-9B5E4132F6A8"), UUID(uuidString: canonical))
        XCTAssertNil(BeaconUUIDNormalizer.uuid(from: nil))
        XCTAssertNil(BeaconUUIDNormalizer.uuid(from: "kein-uuid"))
    }

    func testLayoutElementKeepsValidBeaconUUIDAndDropsMalformed() throws {
        let json = """
        {"id":1,"type":"beacon","beaconUUID":"{AD61389A74864 8FAAFA29B5E4132F6A8}","x":0,"y":0}
        """
        let element = try JSONDecoder().decode(LayoutElement.self, from: Data(json.utf8))

        XCTAssertNil(element.beaconUUID, "Ungueltige Gruppierung mit Leerzeichen wird verworfen")

        let valid = try JSONDecoder().decode(
            LayoutElement.self,
            from: Data(#"{"id":2,"type":"beacon","beaconUUID":"AD61389A748648FAAFA29B5E4132F6A8","x":0,"y":0}"#.utf8)
        )
        XCTAssertEqual(valid.beaconUUID, canonical)
    }
}
