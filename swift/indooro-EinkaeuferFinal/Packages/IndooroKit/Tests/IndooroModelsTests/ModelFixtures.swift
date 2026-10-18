import Foundation

/// Lädt die JSON-Fixtures aus `SP/Fixtures` (fuenf Ebenen ueber dieser Datei). Die Tests lesen nur lokale
/// Dateien, kein Netzwerk; der Pfad ist relativ zu `#filePath`, weil SwiftPM Ressourcen ausserhalb des
/// Paketordners nicht kopieren darf.
enum ModelFixtures {
    static let directory: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // IndooroModelsTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // IndooroKit
        .deletingLastPathComponent() // Packages
        .deletingLastPathComponent() // swift/indooro-EinkaeuferFinal
        .appendingPathComponent("Fixtures", isDirectory: true)

    static func data(_ name: String) throws -> Data {
        try Data(contentsOf: directory.appendingPathComponent(name))
    }
}
