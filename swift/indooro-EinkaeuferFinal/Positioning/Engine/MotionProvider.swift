import Foundation

/// Kumulativer Schrittzaehler (CMPedometer).
struct StepSample: Sendable, Equatable {
    let cumulativeSteps: Int
    let timestamp: TimeInterval

    init(cumulativeSteps: Int, timestamp: TimeInterval) {
        self.cumulativeSteps = cumulativeSteps
        self.timestamp = timestamp
    }
}

/// Bewegungsdaten fuer die bewegungsgestuetzte Schaetzung (`improve-positioning-with-motion`).
/// Die Lieferung erfolgt abseits des Hauptakteurs; die Engine verarbeitet sie auf ihrem eigenen Akteur.
protocol MotionProvider: Sendable {
    func steps() -> AsyncStream<StepSample>
    func start() async
    func stop() async
}
