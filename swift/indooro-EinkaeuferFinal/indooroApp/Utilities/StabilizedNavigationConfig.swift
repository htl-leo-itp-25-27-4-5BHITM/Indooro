import Foundation

struct StabilizedNavigationConfig {
    var beacon = BeaconPositioningConfig()
    var poseFusion = PoseFusionConfig()
    var route = RouteStabilityConfig()
    var confidence = ConfidenceConfig()

    static let `default` = StabilizedNavigationConfig()
}

struct BeaconPositioningConfig {
    var updateIntervalSeconds: TimeInterval = 0.35
    var warmupSeconds: TimeInterval = 1.2
    var staleMeasurementSeconds: TimeInterval = 2.0
    var minBeaconCountForSolution: Int = 3
    var minDistanceMeters: Float = 0.35
    var maxDistanceMeters: Float = 11.0
    var pathLossExponent: Float = 2.8
    var solverResidualScaleMeters: Float = 0.85
    var solverDamping: Float = 0.55
}

struct PoseFusionConfig {
    // Glaettung: estimate += alpha * (punkt - estimate), alpha linear nach Konfidenz.
    var estimatorHighConfidenceAlpha: Float = 0.46 // provisional
    var estimatorLowConfidenceAlpha: Float = 0.18 // provisional
    // Sprung-Gate: Punkt wird gehalten, wenn er weiter als
    // maxPlausibleSpeed * dt + jumpMargin vom Schaetzwert entfernt ist.
    var maxPlausibleSpeed: Float = 2.5 // provisional (m/s)
    var jumpMargin: Float = 0.85 // provisional (m)
    var jumpConfirmations: Int = 3 // provisional
    var jumpClusterRadius: Float = 1.275 // provisional (m)
}

struct RouteStabilityConfig {
    var offRouteDistanceMeters: Float = 8.0
    var offRouteHoldSeconds: TimeInterval = 6.0
    var rerouteCooldownSeconds: TimeInterval = 20.0
    var minReroutePositionChangeMeters: Float = 5.0
    var minRouteDifferenceToReplace: Float = 6.0
    var activeSegmentLockDistanceMeters: Float = 2.4
    var decisionUnlockDistanceMeters: Float = 2.6
    var progressBacktrackToleranceMeters: Float = 3.0
    var rerouteRequiresAlternativeEdgeScoreGain: Float = 2.0
    var manualCalibrationTriggersReroute: Bool = true
}

struct ConfidenceConfig {
    var lowThreshold: Float = 0.35
    var recoverThreshold: Float = 0.55
    var minBeaconCountForTracking: Int = 3
}
