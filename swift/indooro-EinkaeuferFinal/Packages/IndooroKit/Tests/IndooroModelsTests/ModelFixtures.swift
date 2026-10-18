import Foundation
import IndooroTestSupport

/// Die Fixtures kommen aus `IndooroTestSupport` (Paketressource, keine Pfade relativ zu `#filePath`).
enum ModelFixtures {
    static func data(_ name: String) throws -> Data {
        try TestFixtures.data(name)
    }
}
