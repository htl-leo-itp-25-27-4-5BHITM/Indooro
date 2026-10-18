import Foundation
import simd

/// Schritt- und Kompassdaten fuer die bewegungsgestuetzte Schaetzung (improve-positioning-with-motion).
/// Rein und plattformunabhaengig: Aufrufer fuettern Zeilen mit Zeitstempel (App oder Replay).
final class MotionTracker {
    private let config: MotionConfig

    // Schritte: kumulativer Zaehler, letzter Stand, bereits verbrauchter Stand.
    private(set) var hasStepData = false
    private var lastCount = 0
    private var consumedCount = 0
    private var lastStepChangeTime: TimeInterval = 0

    // Kompass: Richtungsvektor in Kartenkoordinaten und Zeit der Speicherung.
    private var storedHeading: SIMD2<Float>?
    private var headingTime: TimeInterval = 0

    init(config: MotionConfig) {
        self.config = config
    }

    // MARK: - Schritte

    /// Kumulative Schrittzahl. Die erste Zeile setzt die Basis; sinkt der Zaehler, wird die Basis neu gesetzt.
    func recordStep(cumulativeSteps n: Int, at t: TimeInterval) {
        guard hasStepData else {
            hasStepData = true
            lastCount = n
            consumedCount = n
            lastStepChangeTime = t
            return
        }
        if n > lastCount {
            lastStepChangeTime = t
            lastCount = n
        } else if n < lastCount {
            // Zaehler zurueckgesetzt: ausstehende Schritte verfallen, Basis neu.
            consumedCount = n
            lastCount = n
            lastStepChangeTime = t
        }
    }

    /// `nil` ohne Schrittdaten; sonst `true`, wenn seit dem letzten Schritt `standingAfterSeconds` vergangen sind.
    func isStanding(at t: TimeInterval) -> Bool? {
        guard hasStepData else { return nil }
        return t - lastStepChangeTime >= config.standingAfterSeconds
    }

    /// Anzahl Schritte seit dem letzten Verbrauch; danach gilt alles als verbraucht.
    func consumeNewSteps() -> Int {
        let newSteps = max(0, lastCount - consumedCount)
        consumedCount = lastCount
        return newSteps
    }

    // MARK: - Kompass

    /// Speichert die Peilung nur bei ausreichender Genauigkeit; sonst ist das Heading ungueltig.
    func recordHeading(bearingDegrees: Double, accuracy: Double, at t: TimeInterval) {
        guard accuracy >= 0, accuracy <= config.headingMaxAccuracyDegrees else {
            storedHeading = nil
            return
        }
        // Kartenkonvention wie BeaconManager.mapHeadingRadians: 0 rad = +y, pi = oben.
        let bearingRadians = bearingDegrees * .pi / 180
        let mapHeading = remainder(.pi - bearingRadians, 2 * .pi)
        // Richtungsvektor konsistent zu atan2(delta.x, delta.y).
        storedHeading = SIMD2(Float(sin(mapHeading)), Float(cos(mapHeading)))
        headingTime = t
    }

    /// Richtung der Karte, sofern das Heading gueltig und nicht aelter als `headingMaxAgeSeconds` ist.
    func headingDirection(at t: TimeInterval) -> SIMD2<Float>? {
        guard let storedHeading, t - headingTime <= config.headingMaxAgeSeconds else { return nil }
        return storedHeading
    }

    func reset() {
        hasStepData = false
        lastCount = 0
        consumedCount = 0
        lastStepChangeTime = 0
        storedHeading = nil
        headingTime = 0
    }
}
