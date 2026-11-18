import Foundation

/// Kompassrichtung des Geraets.
struct HeadingSample: Sendable, Equatable {
    /// Richtung in Grad (0 = Nord, im Uhrzeigersinn); wahre Richtung, sonst magnetische.
    let degrees: Double
    /// Genauigkeit in Grad; negativ heisst ungueltig.
    let accuracyDegrees: Double
    let timestamp: TimeInterval

    init(degrees: Double, accuracyDegrees: Double, timestamp: TimeInterval) {
        self.degrees = degrees
        self.accuracyDegrees = accuracyDegrees
        self.timestamp = timestamp
    }
}

protocol HeadingProvider: Sendable {
    func headings() -> AsyncStream<HeadingSample>
    func start() async
    func stop() async
}
