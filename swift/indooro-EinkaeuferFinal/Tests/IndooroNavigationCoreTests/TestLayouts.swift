import IndooroModels
import Foundation
@testable import IndooroNavigationCore

enum TestLayouts {
    enum LoadError: Error {
        case resourceMissing
        case invalidJSON
    }

    static func demoSupermarketData() throws -> Data {
        guard let url = Bundle.module.url(
            forResource: "layout-demosupermarkt",
            withExtension: "json",
            subdirectory: "Resources"
        ) else {
            throw LoadError.resourceMissing
        }
        return try Data(contentsOf: url)
    }

    /// Dekodiert das Demo-Layout und haengt optional ein Beacon-Raster an
    /// (Standard: ein Beacon pro 8 m x 8 m Zelle, mittig in der Zelle).
    static func demoSupermarket(beaconSpacing: Double? = 8) throws -> LayoutData {
        let data = try demoSupermarketData()
        guard var root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              var elements = root["elements"] as? [[String: Any]],
              let grid = root["gridSize"] as? [String: Any],
              let width = (grid["width"] as? NSNumber)?.doubleValue,
              let height = (grid["height"] as? NSNumber)?.doubleValue else {
            throw LoadError.invalidJSON
        }

        if let spacing = beaconSpacing {
            var nextID: Int64 = 900_000
            var cellY = 0.0
            while cellY < height {
                var cellX = 0.0
                while cellX < width {
                    let beaconX = min(cellX + spacing / 2, width - 0.5)
                    let beaconY = min(cellY + spacing / 2, height - 0.5)
                    elements.append([
                        "id": nextID,
                        "type": "beacon",
                        "beaconId": "TEST-\(nextID)",
                        "beaconUUID": "11111111-2222-3333-4444-555555555555",
                        "beaconMajor": 1,
                        "beaconMinor": Int(nextID - 900_000),
                        "x": beaconX,
                        "y": beaconY
                    ])
                    nextID += 1
                    cellX += spacing
                }
                cellY += spacing
            }
            root["elements"] = elements
        }

        let modified = try JSONSerialization.data(withJSONObject: root)
        return try JSONDecoder().decode(LayoutData.self, from: modified)
    }

    static func demoGraph(layout: LayoutData) -> IndoorGraph {
        IndoorGraphBuilder.fromLayout(
            gridWidth: Int(layout.gridSize.width),
            gridHeight: Int(layout.gridSize.height),
            elements: layout.elements
        )
    }
}
