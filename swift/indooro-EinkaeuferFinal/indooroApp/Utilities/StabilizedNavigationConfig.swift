import Foundation

struct StabilizedNavigationConfig {
    var beacon = BeaconPositioningConfig()
    var poseFusion = PoseFusionConfig()
    var route = RouteStabilityConfig()
    var confidence = ConfidenceConfig()
    var planning = PlanningConfig()

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
    var defaultTxPowerDBm: Float = -72
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
    /// Abbiegestrafe der Routensuche in Metern pro Richtungswechsel.
    static let defaultTurnPenaltyMeters: Float = 1.5 // provisional

    var turnPenaltyMeters: Float = RouteStabilityConfig.defaultTurnPenaltyMeters // provisional
    // Fortschritt faellt nur, wenn die Projektion weiter als diese Toleranz hinter dem Maximum liegt.
    var progressBacktrackToleranceMeters: Float = 3.0 // provisional
    // Eine Off-Route-Evidenz gilt, solange die projizierte Position weiter als
    // offRouteDistanceMeters von der Route entfernt ist; nach offRouteHoldSeconds wird neu geroutet.
    var offRouteDistanceMeters: Float = 4.0 // provisional
    var offRouteHoldSeconds: TimeInterval = 2.5 // provisional
}

struct ConfidenceConfig {
    var lowThreshold: Float = 0.35
    var recoverThreshold: Float = 0.55
    var minBeaconCountForTracking: Int = 3
}

struct PlanningConfig {
    // 2-opt auf dem offenen Pfad: ein Zug wird nur angewendet, wenn er mehr als dieses Minimum spart.
    var twoOptMinimumGainMeters: Float = 0.01 // provisional
    var twoOptMaxPasses: Int = 50 // provisional
}
