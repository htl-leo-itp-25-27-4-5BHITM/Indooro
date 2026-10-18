import Foundation

/// Kumulativer Schrittzaehler (CMPedometer).
public struct StepSample: Sendable, Equatable {
    public let cumulativeSteps: Int
    public let timestamp: TimeInterval

    public init(cumulativeSteps: Int, timestamp: TimeInterval) {
        self.cumulativeSteps = cumulativeSteps
        self.timestamp = timestamp
    }
}

/// Bewegungsdaten fuer die bewegungsgestuetzte Schaetzung (`improve-positioning-with-motion`).
/// Die Lieferung erfolgt abseits des Hauptakteurs; die Engine verarbeitet sie auf ihrem eigenen Akteur.
public protocol MotionProvider: Sendable {
    func steps() -> AsyncStream<StepSample>
    func start() async
    func stop() async
}
