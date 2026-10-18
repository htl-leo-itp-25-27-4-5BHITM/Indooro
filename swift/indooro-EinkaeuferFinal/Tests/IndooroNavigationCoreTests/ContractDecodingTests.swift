import IndooroModels
import XCTest
@testable import IndooroPilotSupport
@testable import IndooroNavigationCore

/// Lädt anonymisierte Live-Antworten bzw. handgemachte Fixtures aus `Fixtures/`.
/// Der Pfad ist relativ zu dieser Datei: Tests/IndooroNavigationCoreTests/<Datei> -> Paketwurzel.
enum ContractFixtures {
    static let directory: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // IndooroNavigationCoreTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // swift/indooro-EinkaeuferFinal
        .appendingPathComponent("Fixtures", isDirectory: true)

    static func data(_ name: String) throws -> Data {
        try Data(contentsOf: directory.appendingPathComponent(name))
    }
}

/// Prüft, dass die Backend-Antworten mit den Modellen dekodieren, so wie es die App-Stores tun
/// (JSONDecoder() ohne Strategie, außer UpsellModel: dateDecodingStrategy = .iso8601).
final class ContractDecodingTests: XCTestCase {

    // MARK: - Stores

    // MARK: - Layout

    // MARK: - Produkte

    func testPlainProductArrayDecoderIsStrictAboutMalformedElements() throws {
        // `[Product]` mit dem Standard-Decoder bleibt strikt. Die App liest Trefferlisten lossy
        // (ProductSearchStore.decodeProducts, prepare-pilot-ios-build 4.2): ein defektes Element
        // wird übersprungen. Das prüft MCindooroAppTests/ProductSearchStoreTests.
        let data = try ContractFixtures.data("products-search-one-malformed.json")

        XCTAssertThrowsError(try JSONDecoder().decode([Product].self, from: data))
    }

    func testLossyArrayDropsMalformedProductAndKeepsTheRest() throws {
        // Die App liest Trefferlisten über LossyDecodableArray (ProductSearchStore.decodeProducts,
        // prepare-pilot-ios-build 4.2). Hier mit dem echten Produktmodell; die Store-Logik selbst
        // (Seitenform, Fehlerfall) liegt nur in der App und ist in MCindooroAppTests/ProductSearchStoreTests.
        let data = try ContractFixtures.data("products-search-one-malformed.json")

        let products = try JSONDecoder.indooro.decode(LossyDecodableArray<Product>.self, from: data).elements

        XCTAssertEqual(products.map(\.id), [92, 94])
    }

    // MARK: - Rezepte

    // MARK: - Upsell

    /// `expiresAt` mit und ohne Bruchteile sowie mit Offset dekodiert `JSONDecoder.indooro` (Task 3.2).
    func testUpsellPlanExpiresAtAcceptsFractionalAndPlainTimestamps() throws {
        let text = String(decoding: try ContractFixtures.data("upsell-plan.json"), as: UTF8.self)
        XCTAssertTrue(text.contains("\"expiresAt\": \"2026-10-16T12:30:00Z\""))

        let cases: [(stamp: String, epochSeconds: Double)] = [
            ("2026-10-16T12:30:00Z", 1_792_153_800),
            ("2026-10-16T12:30:00+00:00", 1_792_153_800),
            ("2026-10-16T12:30:00.123Z", 1_792_153_800.123),
            ("2026-10-16T12:30:00.123456Z", 1_792_153_800.123456),
            ("2026-10-16T14:30:00.5+02:00", 1_792_153_800.5)
        ]
        for (stamp, epoch) in cases {
            let payload = text.replacingOccurrences(of: "2026-10-16T12:30:00Z", with: stamp)
            let plan = try JSONDecoder.indooro.decode(UpsellPlanResponse.self, from: Data(payload.utf8))
            XCTAssertEqual(try XCTUnwrap(plan.expiresAt).timeIntervalSince1970, epoch, accuracy: 0.001, stamp)
        }
    }
}
