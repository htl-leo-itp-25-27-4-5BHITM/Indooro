import Foundation

public struct StabilizedNavigationConfig : Sendable {
    public var beacon = BeaconPositioningConfig()
    var poseFusion = PoseFusionConfig()
    public var route = RouteStabilityConfig()
    public var confidence = ConfidenceConfig()
    public var planning = PlanningConfig()
    var motion = MotionConfig()

    public static let `default` = StabilizedNavigationConfig()
}

// Bewegungsgestuetzte Schaetzung (improve-positioning-with-motion). Flag aus = Verhalten unveraendert.
// Alle Werte sind provisional bis zur Auswertung echter Aufnahmen (improve-positioning-with-motion Gruppe 4).
struct MotionConfig : Sendable {
    var motionAided: Bool = false // provisional (Flag, Default AUS)
    var standingAfterSeconds: TimeInterval = 1.5 // provisional
    var standingAlphaFactor: Float = 0.2 // provisional
    var stepLengthMeters: Float = 0.7 // provisional
    var headingToleranceRadians: Float = .pi / 3 // provisional
    var standingJumpConfirmations: Int = 12 // provisional
    // Kompasspeilung nur bei Genauigkeit bis dazu (wie reliableHeadingAccuracyThreshold) und nicht aelter als Sekunden.
    var headingMaxAccuracyDegrees: Double = 25 // provisional
    var headingMaxAgeSeconds: TimeInterval = 2.0 // provisional
}

public struct BeaconPositioningConfig : Sendable {
    public init() {}

    public var updateIntervalSeconds: TimeInterval = 0.35
    public var warmupSeconds: TimeInterval = 1.2
    var staleMeasurementSeconds: TimeInterval = 2.0
    var minBeaconCountForSolution: Int = 3
    var minDistanceMeters: Float = 0.35
    var maxDistanceMeters: Float = 11.0
    var pathLossExponent: Float = 2.8
    var defaultTxPowerDBm: Float = -72
    var solverResidualScaleMeters: Float = 0.85
    var solverDamping: Float = 0.55
}

struct PoseFusionConfig : Sendable {
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

public struct RouteStabilityConfig : Sendable {
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

public struct ConfidenceConfig : Sendable {
    public var lowThreshold: Float = 0.35
    var recoverThreshold: Float = 0.55
    var minBeaconCountForTracking: Int = 3
}

public struct PlanningConfig : Sendable {
    // 2-opt auf dem offenen Pfad: ein Zug wird nur angewendet, wenn er mehr als dieses Minimum spart.
    var twoOptMinimumGainMeters: Float = 0.01 // provisional
    var twoOptMaxPasses: Int = 50 // provisional
}
