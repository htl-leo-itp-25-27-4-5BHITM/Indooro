import Foundation

/// JSON-Fixtures für die Tests aller IndooroKit-Targets (Kopie von `SP/Fixtures`, siehe `FixtureSyncTests`).
/// Die Fixtures liegen als Paketressource im Bundle, die Tests brauchen keine Pfade relativ zu `#filePath`.
public enum TestFixtures {
    public enum LoadError: Error, CustomStringConvertible {
        case missing(String)

        public var description: String {
            switch self {
            case .missing(let name): "Fixture \(name) fehlt in IndooroTestSupport/Resources"
            }
        }
    }

    /// Ordner mit den Fixtures im Ressourcen-Bundle.
    public static let directory: URL = Bundle.module.bundleURL.appendingPathComponent("Resources", isDirectory: true)

    /// Inhalt einer Fixture, z. B. `stores.json` oder `Layouts/layout-demosupermarkt.json`.
    public static func data(_ name: String) throws -> Data {
        let url = directory.appendingPathComponent(name)
        guard FileManager.default.fileExists(atPath: url.path) else { throw LoadError.missing(name) }
        return try Data(contentsOf: url)
    }

    /// Namen aller Fixtures relativ zu `directory`.
    public static func allNames() throws -> [String] {
        let base = directory.standardizedFileURL.path
        guard let enumerator = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.isRegularFileKey]) else { return [] }
        var names: [String] = []
        for case let url as URL in enumerator where (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true {
            names.append(String(url.standardizedFileURL.path.dropFirst(base.count + 1)))
        }
        return names.sorted()
    }
}
