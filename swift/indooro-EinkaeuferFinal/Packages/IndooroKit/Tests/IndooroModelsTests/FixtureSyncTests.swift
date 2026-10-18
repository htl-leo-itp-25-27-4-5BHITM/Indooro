import IndooroTestSupport
import XCTest

/// `IndooroTestSupport/Resources` ist eine Kopie der Contract-Fixtures aus `SP/Fixtures` (Task 3.4).
/// Der Test schlägt an, wenn eine der beiden Seiten allein geändert wird.
final class FixtureSyncTests: XCTestCase {
    private let sourceFixtures = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // IndooroModelsTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // IndooroKit
        .deletingLastPathComponent() // Packages
        .deletingLastPathComponent() // swift/indooro-EinkaeuferFinal
        .appendingPathComponent("Fixtures", isDirectory: true)

    func testCopiedFixturesMatchTheSourceFixtures() throws {
        guard FileManager.default.fileExists(atPath: sourceFixtures.path) else {
            throw XCTSkip("SP/Fixtures nicht erreichbar")
        }
        let names = try TestFixtures.allNames()
        XCTAssertFalse(names.isEmpty)
        for name in names {
            // Das Demo-Layout liegt in SP/Fixtures/Layouts, alle anderen direkt in SP/Fixtures.
            let source = sourceFixtures.appendingPathComponent(name)
            XCTAssertEqual(try Data(contentsOf: source), try TestFixtures.data(name), "\(name) weicht von SP/Fixtures ab")
        }
    }
}
