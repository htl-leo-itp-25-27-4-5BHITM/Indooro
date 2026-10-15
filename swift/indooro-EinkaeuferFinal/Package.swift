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
                "Utilities/IndoorGraph.swift",
                "Utilities/KalmanFilter.swift",
                "Utilities/BeaconPositionSolver.swift",
                "Utilities/PoseFusionService.swift",
                "Utilities/WalkableProjector.swift",
                "Utilities/BeaconMeasurementStore.swift",
                "Utilities/RouteManager.swift",
                "Utilities/StabilizedNavigationConfig.swift"
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
