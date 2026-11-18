import Foundation
import simd

/// Blickrichtung der Anzeige (Logik von `BeaconManager`): Bewegungsrichtung aus aufeinanderfolgenden
/// Rohpunkten, Kompass, exponentielle Glaettung und Mindestaenderung von 1 Grad.
/// Reiner Wertetyp ohne Uhr; die Zeit kommt von den Aufrufern.
struct HeadingFusion: Sendable {
    static let minimumMovementMeters: Float = 0.12
    static let reliabilityTimeout: TimeInterval = 1.4
    static let smoothingAlpha: Float = 0.24
    static let reliableAccuracyDegrees: Double = 25
    static let minimumPublishedChange: Float = .pi / 180

    private var lastRawPoint: SIMD2<Float>?
    private var lastRawTimestamp: TimeInterval?
    private var lastMovementHeading: Float?
    private var lastMovementTimestamp: TimeInterval?
    private var deviceHeading: Float?
    private var accuracyDegrees: Double = -1
    private var smoothed: Float?
    private(set) var published: Float?
    private(set) var isReliable = false

    /// Bewegungsrichtung zwischen zwei Rohpunkten; `nil` bei weniger als 12 cm Bewegung.
    mutating func movementHeading(currentPoint: SIMD2<Float>, timestamp: TimeInterval) -> Float? {
        defer {
            lastRawPoint = currentPoint
            lastRawTimestamp = timestamp
        }
        guard let previous = lastRawPoint, let previousTime = lastRawTimestamp, timestamp - previousTime > 0 else {
            return nil
        }
        let delta = currentPoint - previous
        guard simd_length(delta) > Self.minimumMovementMeters else { return nil }
        let heading = atan2(delta.x, delta.y)
        lastMovementHeading = heading
        lastMovementTimestamp = timestamp
        return heading
    }

    /// Letzte Bewegungsrichtung ohne Altersgrenze (Kompass-Updates verwenden sie so).
    var lastMovement: Float? { lastMovementHeading }

    func recentMovementHeading(at timestamp: TimeInterval) -> Float? {
        guard let lastMovementHeading, let lastMovementTimestamp,
              timestamp - lastMovementTimestamp <= Self.reliabilityTimeout else { return nil }
        return lastMovementHeading
    }

    /// Kompass uebernehmen. Karte: 0 rad zeigt nach unten, Nord (0 Grad) wird auf +pi abgebildet.
    mutating func updateDevice(degrees: Double, accuracyDegrees: Double) {
        guard accuracyDegrees >= 0 else {
            self.accuracyDegrees = -1
            deviceHeading = nil
            return
        }
        self.accuracyDegrees = accuracyDegrees
        deviceHeading = Self.normalize(.pi - Float(degrees) * .pi / 180)
    }

    /// Glaettet die anzuzeigende Richtung. Bevorzugt Kompass, dann frische Bewegung, dann Bewegung, dann den letzten Wert.
    mutating func refresh(movementHeading: Float?, movementHeadingIsFresh: Bool) {
        let reliableNow = deviceHeading != nil && accuracyDegrees >= 0 && accuracyDegrees <= Self.reliableAccuracyDegrees
        isReliable = reliableNow

        let preferred = deviceHeading
            ?? (movementHeadingIsFresh ? movementHeading : nil)
            ?? movementHeading
            ?? smoothed
        guard let preferred else {
            isReliable = false
            return
        }
        if let current = smoothed {
            let delta = Self.normalize(preferred - current)
            smoothed = Self.normalize(current + delta * Self.smoothingAlpha)
        } else {
            smoothed = preferred
        }
        publish(smoothed)
    }

    /// Nach manueller Kalibrierung: Verlauf verwerfen und Anker auf den neuen Punkt setzen.
    mutating func resetAfterCalibration(point: SIMD2<Float>, timestamp: TimeInterval) {
        lastRawPoint = point
        lastRawTimestamp = timestamp
        lastMovementHeading = nil
        lastMovementTimestamp = nil
        smoothed = nil
        published = nil
        isReliable = false
    }

    /// Beim Leeren der Messungen (Layoutwechsel, Stopp).
    mutating func clearHeadingState() {
        lastMovementHeading = nil
        lastMovementTimestamp = nil
        smoothed = nil
        published = nil
        isReliable = false
    }

    private mutating func publish(_ heading: Float?) {
        switch (published, heading) {
        case (nil, nil):
            return
        case let (current?, new?):
            guard abs(Self.normalize(new - current)) >= Self.minimumPublishedChange else { return }
        default:
            break
        }
        published = heading
    }

    static func normalize(_ angle: Float) -> Float {
        var value = angle
        while value > .pi { value -= 2 * .pi }
        while value < -.pi { value += 2 * .pi }
        return value
    }
}
