// swift-tools-version:5.10
import PackageDescription

// Reines Test-Package fuer die Navigationslogik. Die App selbst wird weiterhin
// ueber MCindooroApp.xcodeproj gebaut; dieses Package referenziert nur die
// plattformunabhaengigen Quelldateien und aendert den App-Build nicht.
let package = Package(
    name: "IndooroNavigationCore",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "IndooroNavigationCore", targets: ["IndooroNavigationCore"])
    ],
    targets: [
        .target(
            name: "IndooroNavigationCore",
            path: "indooroApp",
            sources: [
                "Models/LayoutData.swift",
                "Models/ShelfLocationDescriptor.swift",
                "Utilities/IndoorGraph.swift",
                "Utilities/KalmanFilter.swift",
                "Utilities/LayoutCacheStore.swift",
                "Utilities/BeaconPositionSolver.swift",
                "Utilities/PoseFusionService.swift",
                "Utilities/WalkableProjector.swift",
                "Utilities/BeaconMeasurementStore.swift",
                "Utilities/NavigationSessionCore.swift",
                "Utilities/TourPlanner.swift",
                "Utilities/PositioningPipeline.swift",
                "Utilities/NavigationReplay.swift",
                "Utilities/StabilizedNavigationConfig.swift",
                "Utilities/AnchorPayload.swift"
            ]
        ),
        .testTarget(
            name: "IndooroNavigationCoreTests",
            dependencies: ["IndooroNavigationCore"],
            path: "Tests/IndooroNavigationCoreTests",
            resources: [.copy("Resources")]
        )
    ]
)
