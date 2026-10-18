import XCTest
@testable import IndooroPilotSupport
@testable import IndooroNavigationCore

/// Task 6.1 und 7.5: Gültigkeit der Filial-Koordinaten und Beschreibung eines Filial-Layouts.
final class StoreMapHelpersTests: XCTestCase {

    private func store(latitude: Double?, longitude: Double?) -> MobileStoreSummary {
        MobileStoreSummary(
            id: UUID(),
            storeCode: "SPAR-Test-001",
            name: "Testfiliale",
            city: "Linz",
            latitude: latitude,
            longitude: longitude
        )
    }

    // MARK: - Koordinaten

    func testPlausibleCoordinateIsAccepted() {
        XCTAssertEqual(
            store(latitude: 48.2680495, longitude: 14.2618747).validCoordinate,
            MobileStoreCoordinate(latitude: 48.2680495, longitude: 14.2618747)
        )
        // Grenzwerte sind gültig.
        XCTAssertEqual(
            MobileStoreSummary.validCoordinate(latitude: -90, longitude: 180),
            MobileStoreCoordinate(latitude: -90, longitude: 180)
        )
        // Nur einer der beiden Werte gleich 0 ist keine Platzhalterposition.
        XCTAssertNotNil(MobileStoreSummary.validCoordinate(latitude: 0, longitude: 14.2))
    }

    func testMissingCoordinateIsRejected() {
        XCTAssertNil(store(latitude: nil, longitude: 14.2).validCoordinate)
        XCTAssertNil(store(latitude: 48.2, longitude: nil).validCoordinate)
        XCTAssertNil(store(latitude: nil, longitude: nil).validCoordinate)
    }

    func testOutOfRangeAndNonFiniteCoordinatesAreRejected() {
        XCTAssertNil(MobileStoreSummary.validCoordinate(latitude: 90.0001, longitude: 14))
        XCTAssertNil(MobileStoreSummary.validCoordinate(latitude: -91, longitude: 14))
        XCTAssertNil(MobileStoreSummary.validCoordinate(latitude: 48, longitude: 180.5))
        XCTAssertNil(MobileStoreSummary.validCoordinate(latitude: 48, longitude: -181))
        XCTAssertNil(MobileStoreSummary.validCoordinate(latitude: .nan, longitude: 14))
        XCTAssertNil(MobileStoreSummary.validCoordinate(latitude: 48, longitude: .infinity))
    }

    func testNullIslandPlaceholderIsRejected() {
        XCTAssertNil(MobileStoreSummary.validCoordinate(latitude: 0, longitude: 0))
    }

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

    func testFallbackLayoutGetsStandardLayoutDescription() {
        XCTAssertEqual(
            StoreLayoutDescription.storeLayout(
                storeName: "EUROSPAR Leonding/Hart",
                fallback: true,
                regularDescription: "EUROSPAR Leonding/Hart • Aktive Filiale"
            ),
            "EUROSPAR Leonding/Hart • Standard-Layout (kein aktives Filial-Layout)"
        )
    }

    func testNonFallbackLayoutKeepsRegularDescription() {
        for fallback in [false, nil] as [Bool?] {
            XCTAssertEqual(
                StoreLayoutDescription.storeLayout(storeName: "Filiale", fallback: fallback, regularDescription: "Regulär"),
                "Regulär"
            )
        }
    }

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
