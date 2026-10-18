// swift-tools-version: 6.0
import PackageDescription

// Lokales Paket IndooroKit (Phase 1 von modernize-ios-client-architecture):
// IndooroNetworking enthaelt die Swift-Typen, die swift-openapi-generator (nur Typen)
// aus api/openapi/indooro-mobile.yaml erzeugt, sowie die Endpoint-URL-Builder der App.
// iOS-Ziel bleibt identisch zum App-Target (IPHONEOS_DEPLOYMENT_TARGET 18.5); macOS
// dient nur dazu, `swift test` auf dem Host auszufuehren.
let package = Package(
    name: "IndooroKit",
    platforms: [
        .iOS("18.5"),
        .macOS(.v14),
    ],
    products: [
        // Statisch: die App und ihr Test-Bundle binden das Paket ein, ohne eigene dynamische Frameworks.
        .library(name: "IndooroModels", type: .static, targets: ["IndooroModels"]),
        .library(name: "IndooroNetworking", type: .static, targets: ["IndooroNetworking"]),
        .library(name: "IndooroNavigation", type: .static, targets: ["IndooroNavigation"]),
        .library(name: "IndooroPersistence", type: .static, targets: ["IndooroPersistence"]),
        .library(name: "IndooroPositioning", type: .static, targets: ["IndooroPositioning"]),
        .library(name: "IndooroUpsell", type: .static, targets: ["IndooroUpsell"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.6.0"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.7.0"),
    ],
    targets: [
        // Reine Datenmodelle (Phase 4): keine Abhaengigkeiten, keine UI- oder Apple-Radio-Frameworks.
        .target(
            name: "IndooroModels"
        ),
        // Nur für Tests: JSON-Fixtures als Paketressource (Task 3.4). Kein Produkt, wird nie in die App gelinkt.
        .target(
            name: "IndooroTestSupport",
            dependencies: ["IndooroPositioning"],
            resources: [.copy("Resources")]
        ),
        .testTarget(
            name: "IndooroModelsTests",
            dependencies: ["IndooroModels", "IndooroTestSupport"]
        ),
        // Navigationskern (Phase 5): Graph, Positionierung, Session, Tourplanung, Replay.
        // Die Quellen wurden fuer Swift 5 geschrieben; Umstellung auf Swift 6 folgt in Task 11.1.
        .target(
            name: "IndooroNavigation",
            dependencies: ["IndooroModels"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "IndooroNavigationTests",
            dependencies: ["IndooroNavigation", "IndooroModels"],
            resources: [.copy("Resources")],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        // Persistenz (Phase 8): ShoppingListRepository (Schema v2, Migration aus UserDefaults) und LayoutCacheStore.
        .target(
            name: "IndooroPersistence",
            dependencies: ["IndooroModels"]
        ),
        .testTarget(
            name: "IndooroPersistenceTests",
            dependencies: ["IndooroPersistence", "IndooroModels"]
        ),
        // Ortung (Phase 9): Funk-Protokolle, `PositioningEngine`, `StoreDetectionService`, `LayoutRepository`.
        // Parallel zu `BeaconManager`, in der App hinter einem Flag (Standard AUS).
        .target(
            name: "IndooroPositioning",
            dependencies: ["IndooroModels", "IndooroNavigation", "IndooroNetworking", "IndooroPersistence"]
        ),
        .testTarget(
            name: "IndooroPositioningTests",
            dependencies: ["IndooroPositioning", "IndooroModels", "IndooroNavigation", "IndooroTestSupport"]
        ),
        // Reine Upsell-Plan-Logik (kanonischer Einkaufszustand, Opportunity-Identitaet, Retry-Regel); Foundation only.
        .target(
            name: "IndooroUpsell",
            dependencies: ["IndooroModels"]
        ),
        .testTarget(
            name: "IndooroUpsellTests",
            dependencies: ["IndooroUpsell", "IndooroModels"]
        ),
        .target(
            name: "IndooroNetworking",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
            ],
            plugins: [
                .plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator"),
            ]
        ),
        .testTarget(
            name: "IndooroNetworkingTests",
            dependencies: ["IndooroNetworking", "IndooroTestSupport"]
        ),
    ]
)
