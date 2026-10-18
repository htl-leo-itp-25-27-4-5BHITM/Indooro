import IndooroModels
import XCTest
@testable import IndooroPilotSupport
@testable import IndooroNavigationCore

/// Task 6.1 und 7.5: Gültigkeit der Filial-Koordinaten und Beschreibung eines Filial-Layouts.
final class StoreMapHelpersTests: XCTestCase {

    func testStoreWithoutCoordinatesDecodesAndHasNoMapPosition() throws {
        let json = """
        {"id":"ad61389a-7486-48fa-afa2-9b5e4132f6a8","storeCode":"SPAR-Leonding-001","name":"EUROSPAR Leonding/Hart","city":"Leonding","address":"Poststraße 10, 4060 Leonding"}
        """
        let decoded = try JSONDecoder.indooro.decode(MobileStoreSummary.self, from: Data(json.utf8))
        XCTAssertNil(decoded.latitude)
        XCTAssertNil(decoded.validCoordinate)
        XCTAssertEqual(decoded.displaySubtitle, "Poststraße 10, 4060 Leonding")
    }

    // MARK: - Layout-Beschreibung

    func testLayoutResponseFallbackFlagIsDecoded() throws {
        let url = ContractFixtures.directory.appendingPathComponent("store-layout-current.json")
        let text = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(text.contains("\"fallback\":false"))

        let active = try JSONDecoder.indooro.decode(MobileLayoutResponse.self, from: Data(text.utf8))
        XCTAssertEqual(active.fallback, false)

        let fallback = try JSONDecoder.indooro.decode(
            MobileLayoutResponse.self,
            from: Data(text.replacingOccurrences(of: "\"fallback\":false", with: "\"fallback\":true").utf8)
        )
        XCTAssertEqual(fallback.fallback, true)
    }
}
