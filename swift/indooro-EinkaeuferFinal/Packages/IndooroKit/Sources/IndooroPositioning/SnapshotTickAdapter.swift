import Foundation
import simd

/// Ein Positionstick fuer die Navigations-Session, abgeleitet aus einem `PositionSnapshot`.
/// Gleiche Felder wie `NavigationSample` der App (`BeaconManager.navigationSamples`).
public struct NavigationTick: Sendable, Equatable {
    public let projectedPosition: SIMD2<Float>?
    public let confidence: Float
    public let timestamp: TimeInterval
    /// Solver-Vertrauen: nur `tracking`. Eine manuell gehaltene Position zaehlt hier nicht (wie im alten Pfad).
    public let isTrusted: Bool

    public init(projectedPosition: SIMD2<Float>?, confidence: Float, timestamp: TimeInterval, isTrusted: Bool) {
        self.projectedPosition = projectedPosition
        self.confidence = confidence
        self.timestamp = timestamp
        self.isTrusted = isTrusted
    }
}

/// Uebersetzt den Snapshot-Strom in die Ereignisse, die `NavigationSession` bisher von `BeaconManager` bekam
/// (task 5.4). Regeln wie im alten Pfad:
/// - Aufwaermphase: kein Tick.
/// - Jeder Tick (`searching`, `lowConfidence`, `tracking`, `manual` ohne neue Kalibrierung): ein `NavigationTick`.
/// - Manuelle Kalibrierung: kein Tick; die Session erfaehrt sie ueber das Kalibrierungsereignis.
/// - Wechsel zu `stopped` („Ohne Ortung“): ein Tick ohne Position mit Konfidenz 1, nicht vertraut.
public struct SnapshotTickAdapter: Sendable {
    public enum Output: Sendable, Equatable {
        case tick(NavigationTick)
        case calibrated(SIMD2<Float>)
    }

    private var lastStatus: PositionSnapshot.Status?
    private var lastCalibrationRevision = 0

    public init() {}

    public mutating func consume(_ snapshot: PositionSnapshot) -> Output? {
        defer { lastStatus = snapshot.status }

        if let calibration = snapshot.lastCalibration, calibration.revision != lastCalibrationRevision {
            lastCalibrationRevision = calibration.revision
            return .calibrated(calibration.point)
        }

        switch snapshot.status {
        case .warmingUp:
            return nil
        case .stopped:
            guard let lastStatus, lastStatus != .stopped else { return nil }
            return .tick(NavigationTick(
                projectedPosition: nil,
                confidence: 1,
                timestamp: snapshot.timestamp,
                isTrusted: false
            ))
        case .searching, .lowConfidence, .tracking, .manual:
            return .tick(NavigationTick(
                projectedPosition: snapshot.displayedPoint,
                confidence: snapshot.confidence,
                timestamp: snapshot.timestamp,
                isTrusted: snapshot.status == .tracking
            ))
        }
    }
}
