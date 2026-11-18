import Foundation
import IndooroNavigation

/// Zeitquelle der Ortung. Messungen und Ticks verwenden Sekunden auf derselben Zeitbasis
/// (App: Unix-Zeit wie bisher `Date().timeIntervalSince1970`). Tests ersetzen die Uhr durch `TestClock`.
protocol PositioningClock: Sendable {
    func now() -> TimeInterval
    func sleep(for seconds: TimeInterval) async throws
}

struct SystemPositioningClock: PositioningClock {
    init() {}

    func now() -> TimeInterval {
        Date().timeIntervalSince1970
    }

    func sleep(for seconds: TimeInterval) async throws {
        try await Task.sleep(for: .seconds(seconds))
    }
}
