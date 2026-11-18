import Foundation
import IndooroNavigation
import simd

/// Manuelle Kalibrierung, wie sie `BeaconManager` als `ManualCalibrationEvent` veroeffentlicht.
struct CalibrationEvent: Sendable, Equatable {
    let revision: Int
    let point: SIMD2<Float>
    let timestamp: TimeInterval

    init(revision: Int, point: SIMD2<Float>, timestamp: TimeInterval) {
        self.revision = revision
        self.point = point
        self.timestamp = timestamp
    }
}

/// Unveraenderliches Ergebnis der Ortung nach einem Tick, einer Kalibrierung oder einem Layoutwechsel.
struct PositionSnapshot: Sendable, Equatable {
    enum Status: String, Sendable, Equatable {
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
    var sequence: Int
    var timestamp: TimeInterval
    var layoutRevision: Int
    var status: Status
    /// Projizierte (begehbare) Position; `nil` ohne Loesung im Tick.
    var displayedPoint: SIMD2<Float>?
    /// Vom Solver geloester Rohpunkt.
    var rawPoint: SIMD2<Float>?
    var headingRadians: Float?
    var isHeadingReliable: Bool
    var confidence: Float
    var isTrusted: Bool
    var activeBeaconCount: Int
    /// `true`, wenn das Sprung-Gate den Rohpunkt dieses Ticks gehalten hat.
    var wasJumpSuppressed: Bool
    var lastCalibration: CalibrationEvent?
    var radio: RadioStatus

    init(
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
