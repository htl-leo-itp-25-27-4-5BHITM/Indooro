import Foundation
import simd

/// Manuelle Kalibrierung, wie sie `BeaconManager` als `ManualCalibrationEvent` veroeffentlicht.
public struct CalibrationEvent: Sendable, Equatable {
    public let revision: Int
    public let point: SIMD2<Float>
    public let timestamp: TimeInterval

    public init(revision: Int, point: SIMD2<Float>, timestamp: TimeInterval) {
        self.revision = revision
        self.point = point
        self.timestamp = timestamp
    }
}

/// Unveraenderliches Ergebnis der Ortung nach einem Tick, einer Kalibrierung oder einem Layoutwechsel.
public struct PositionSnapshot: Sendable, Equatable {
    public enum Status: String, Sendable, Equatable {
        /// Ortung nicht gestartet (Modus „Ohne Ortung“).
        case stopped
        /// Aufwaermphase nach dem Start; es wird noch nicht geloest.
        case warmingUp
        /// Zu wenige frische Beacons fuer eine Loesung.
        case searching
        /// Position vorhanden, Konfidenz unter der Schwelle.
        case lowConfidence
        /// Vertraute Solver-Position.
        case tracking
        /// Manuell kalibrierte Position gilt als vertraut, bis ein sicherer Tick eintrifft.
        case manual
    }

    /// Laufnummer; steigt mit jedem veroeffentlichten Snapshot.
    public var sequence: Int
    public var timestamp: TimeInterval
    public var layoutRevision: Int
    public var status: Status
    /// Projizierte (begehbare) Position; `nil` ohne Loesung im Tick.
    public var displayedPoint: SIMD2<Float>?
    /// Vom Solver geloester Rohpunkt.
    public var rawPoint: SIMD2<Float>?
    public var headingRadians: Float?
    public var isHeadingReliable: Bool
    public var confidence: Float
    public var isTrusted: Bool
    public var activeBeaconCount: Int
    /// `true`, wenn das Sprung-Gate den Rohpunkt dieses Ticks gehalten hat.
    public var wasJumpSuppressed: Bool
    public var lastCalibration: CalibrationEvent?
    public var radio: RadioStatus

    public init(
        sequence: Int,
        timestamp: TimeInterval,
        layoutRevision: Int,
        status: Status,
        displayedPoint: SIMD2<Float>? = nil,
        rawPoint: SIMD2<Float>? = nil,
        headingRadians: Float? = nil,
        isHeadingReliable: Bool = false,
        confidence: Float = 0,
        isTrusted: Bool = false,
        activeBeaconCount: Int = 0,
        wasJumpSuppressed: Bool = false,
        lastCalibration: CalibrationEvent? = nil,
        radio: RadioStatus = RadioStatus()
    ) {
        self.sequence = sequence
        self.timestamp = timestamp
        self.layoutRevision = layoutRevision
        self.status = status
        self.displayedPoint = displayedPoint
        self.rawPoint = rawPoint
        self.headingRadians = headingRadians
        self.isHeadingReliable = isHeadingReliable
        self.confidence = confidence
        self.isTrusted = isTrusted
        self.activeBeaconCount = activeBeaconCount
        self.wasJumpSuppressed = wasJumpSuppressed
        self.lastCalibration = lastCalibration
        self.radio = radio
    }
}
