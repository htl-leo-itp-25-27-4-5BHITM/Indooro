import XCTest
@testable import IndooroModels

/// Filialmodelle: Dekodierung der Store-Fixture, Koordinatenpruefung und Layout-Beschreibung.
final class StoreDecodingTests: XCTestCase {

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

    func testStoresDecodeToFourSummaries() throws {
        let stores = try JSONDecoder().decode([MobileStoreSummary].self, from: ModelFixtures.data("stores.json"))

        XCTAssertEqual(stores.count, 4)

        let first = try XCTUnwrap(stores.first)
        XCTAssertEqual(first.id, UUID(uuidString: "ad61389a-7486-48fa-afa2-9b5e4132f6a8"))
        XCTAssertEqual(first.storeCode, "SPAR-Leonding-001")
        XCTAssertEqual(first.name, "EUROSPAR Leonding/Hart")
        XCTAssertEqual(first.city, "Leonding")
        XCTAssertEqual(try XCTUnwrap(first.latitude), 48.2680495, accuracy: 1e-7)
        XCTAssertEqual(try XCTUnwrap(first.longitude), 14.2618747, accuracy: 1e-7)

        // stores.json liefert "address" als einen String; MobileStoreSummary bildet ihn auf `address` ab
        // (prepare-pilot-ios-build), street/zipCode bleiben leer.
        XCTAssertNil(first.street)
        XCTAssertNil(first.zipCode)
        XCTAssertEqual(first.address, "Poststraße 10, 4060 Leonding")
        XCTAssertEqual(first.displaySubtitle, "Poststraße 10, 4060 Leonding")
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

    // MARK: - Layout-Beschreibung

    func testFallbackLayoutGetsStandardLayoutDescription() {
        XCTAssertEqual(
            StoreLayoutDescription.storeLayout(
                storeName: "EUROSPAR Leonding/Hart",
                fallback: true,
                regularDescription: "EUROSPAR Leonding/Hart • Aktive Filiale"
            ),
            "EUROSPAR Leonding/Hart • Ersatzplan (kein aktueller Marktplan)"
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
}
