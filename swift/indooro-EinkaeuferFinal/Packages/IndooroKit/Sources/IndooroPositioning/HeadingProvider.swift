import Foundation

/// Kompassrichtung des Geraets.
public struct HeadingSample: Sendable, Equatable {
    /// Richtung in Grad (0 = Nord, im Uhrzeigersinn); wahre Richtung, sonst magnetische.
    public let degrees: Double
    /// Genauigkeit in Grad; negativ heisst ungueltig.
    public let accuracyDegrees: Double
    public let timestamp: TimeInterval

    public init(degrees: Double, accuracyDegrees: Double, timestamp: TimeInterval) {
        self.degrees = degrees
        self.accuracyDegrees = accuracyDegrees
        self.timestamp = timestamp
    }
}

public protocol HeadingProvider: Sendable {
    func headings() -> AsyncStream<HeadingSample>
    func start() async
    func stop() async
}
