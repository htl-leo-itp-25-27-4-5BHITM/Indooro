// swift-tools-version:5.10
import PackageDescription

// Reines Test-Package fuer die Navigationslogik. Die App selbst wird weiterhin
// ueber MCindooroApp.xcodeproj gebaut; dieses Package referenziert nur die
// plattformunabhaengigen Quelldateien und aendert den App-Build nicht.
let package = Package(
    name: "IndooroNavigationCore",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "IndooroNavigationCore", targets: ["IndooroNavigationCore"]),
        // Offline-Vergleich der aktuellen Pipeline und der PositioningEngine (openspec compare-positioning-pipelines).
        // Nicht Teil der App; das Werkzeug laeuft nur auf dem Mac.
        .executable(name: "compare-positioning", targets: ["ComparePositioningCLI"])
    ],
    dependencies: [
        // Lokales Paket mit den Datenmodellen (Phase 4 von modernize-ios-client-architecture).
        .package(path: "Packages/IndooroKit")
    ],
    targets: [
        .target(name: "IndooroPilotSupport", path: "indooroApp", sources: ["App/AppEnvironment.swift", "Utilities/PilotNetworking.swift", "Models/StudyModels.swift", "Managers/StudySessionStore.swift"]),
        .testTarget(name: "IndooroPilotSupportTests", dependencies: ["IndooroPilotSupport"], path: "Tests/IndooroPilotSupportTests"),
        .target(
            name: "IndooroNavigationCore",
            dependencies: [
                .product(name: "IndooroModels", package: "IndooroKit")
            ],
            // Paketwurzel statt `indooroApp`: so koennen `Positioning/Engine` (Kopie des Engine-Kerns von
            // `postpilot/ios-architecture`, siehe `Positioning/README.md`) und `Positioning/Compare` im selben Modul
            // liegen wie die Navigationsquellen. Die App-Quellen unter `indooroApp/` bleiben unveraendert.
            path: ".",
            sources: [
                "indooroApp/Utilities/IndoorGraph.swift",
                "indooroApp/Utilities/KalmanFilter.swift",
                "indooroApp/Utilities/LayoutCacheStore.swift",
                "indooroApp/Utilities/AppLog.swift",
                "indooroApp/Utilities/BeaconPositionSolver.swift",
                "indooroApp/Utilities/PoseFusionService.swift",
                "indooroApp/Utilities/WalkableProjector.swift",
                "indooroApp/Utilities/BeaconMeasurementStore.swift",
                "indooroApp/Utilities/NavigationSessionCore.swift",
                "indooroApp/Utilities/TourPlanner.swift",
                "indooroApp/Utilities/PositioningPipeline.swift",
                "indooroApp/Utilities/MotionTracker.swift",
                "indooroApp/Utilities/NavigationReplay.swift",
                "indooroApp/Utilities/StabilizedNavigationConfig.swift",
                "indooroApp/Utilities/AnchorPayload.swift",
                "indooroApp/Utilities/AccessibilityText.swift",
                "indooroApp/Utilities/AccessibilityPalette.swift",
                "indooroApp/Utilities/ArrivalSuggestionDetector.swift",
                "indooroApp/Utilities/UpsellPlanLogic.swift",
                "Positioning/Engine",
                "Positioning/Compare"
            ]
        ),
        .testTarget(
            name: "IndooroNavigationCoreTests",
            dependencies: [
                "IndooroNavigationCore",
                "IndooroPilotSupport",
                .product(name: "IndooroModels", package: "IndooroKit")
            ],
            path: "Tests/IndooroNavigationCoreTests",
            resources: [.copy("Resources")]
        ),
        .executableTarget(
            name: "ComparePositioningCLI",
            dependencies: ["IndooroNavigationCore"],
            path: "Positioning/CLI"
        ),
        .testTarget(
            name: "IndooroPositioningCompareTests",
            dependencies: [
                "IndooroNavigationCore",
                .product(name: "IndooroModels", package: "IndooroKit")
            ],
            path: "Tests/IndooroPositioningCompareTests"
        )
    ]
)
