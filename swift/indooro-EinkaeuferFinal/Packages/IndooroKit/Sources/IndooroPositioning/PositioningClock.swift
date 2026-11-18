import Foundation

/// Zeitquelle der Ortung. Messungen und Ticks verwenden Sekunden auf derselben Zeitbasis
/// (App: Unix-Zeit wie bisher `Date().timeIntervalSince1970`). Tests ersetzen die Uhr durch `TestClock`.
public protocol PositioningClock: Sendable {
    func now() -> TimeInterval
    func sleep(for seconds: TimeInterval) async throws
}

public struct SystemPositioningClock: PositioningClock {
    public init() {}

    public func now() -> TimeInterval {
        Date().timeIntervalSince1970
    }

    public func sleep(for seconds: TimeInterval) async throws {
        try await Task.sleep(for: .seconds(seconds))
    }
}
