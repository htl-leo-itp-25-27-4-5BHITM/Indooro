import XCTest
@testable import IndooroNetworking

/// Paritaet zu `JSONDecoder.indooro` (App, `indooroApp/Utilities/PilotNetworking.swift`):
/// dieselben akzeptierten ISO-8601-Eingaben, dieselbe Ablehnung unbekannter Formate.
final class JSONCodingTests: XCTestCase {
    private struct Stamp: Decodable {
        let at: Date
    }

    private func decode(_ text: String) throws -> Date {
        try JSONCoding.makeDecoder().decode(Stamp.self, from: Data("{\"at\":\"\(text)\"}".utf8)).at
    }

    /// Referenzzeitpunkt 2026-10-18T10:00:00Z (1792317600).
    private let reference = Date(timeIntervalSince1970: 1_792_317_600)

    func testAcceptsZuluWithoutFraction() throws {
        XCTAssertEqual(try decode("2026-10-18T10:00:00Z").timeIntervalSince1970, reference.timeIntervalSince1970, accuracy: 0.0001)
    }

    func testAcceptsZeroOffset() throws {
        XCTAssertEqual(try decode("2026-10-18T10:00:00+00:00").timeIntervalSince1970, reference.timeIntervalSince1970, accuracy: 0.0001)
    }

    func testAcceptsMilliseconds() throws {
        XCTAssertEqual(try decode("2026-10-18T10:00:00.123Z").timeIntervalSince1970, reference.timeIntervalSince1970 + 0.123, accuracy: 0.0005)
    }

    func testAcceptsMicroseconds() throws {
        XCTAssertEqual(try decode("2026-10-18T10:00:00.123456Z").timeIntervalSince1970, reference.timeIntervalSince1970 + 0.123456, accuracy: 0.0005)
    }

    func testAcceptsPositiveOffset() throws {
        XCTAssertEqual(try decode("2026-10-18T12:00:00+02:00").timeIntervalSince1970, reference.timeIntervalSince1970, accuracy: 0.0001)
    }

    func testRejectsUnknownFormats() {
        XCTAssertThrowsError(try decode("18.10.2026"))
        XCTAssertThrowsError(try decode("2026-10-18"))
        XCTAssertThrowsError(try decode("")) 
    }

    func testDecodingErrorIsDataCorrupted() {
        do {
            _ = try decode("nicht-ein-datum")
            XCTFail("Fehler erwartet")
        } catch DecodingError.dataCorrupted(let context) {
            XCTAssertEqual(context.debugDescription, "Ungültiges Datum")
        } catch {
            XCTFail("Erwartet dataCorrupted, erhalten \(error)")
        }
    }
}
