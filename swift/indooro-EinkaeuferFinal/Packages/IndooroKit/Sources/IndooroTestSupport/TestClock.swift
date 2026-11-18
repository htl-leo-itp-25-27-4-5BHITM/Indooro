import Foundation
import IndooroPositioning

/// Manuelle Uhr fuer die Ortungstests. `sleep` wartet, bis `advance(by:)` die Zeit weit genug vorstellt.
/// `advance` weckt die Schlafenden in zeitlicher Reihenfolge und wartet nach jedem Wecken, bis der Weckende
/// wieder schlaeft; so ist ein Tick der Engine abgeschlossen, bevor der naechste beginnt.
public final class TestClock: PositioningClock, @unchecked Sendable {
    private struct Sleeper {
        let id: Int
        let wakeTime: TimeInterval
        let continuation: CheckedContinuation<Void, Error>
    }

    private let lock = NSLock()
    private var current: TimeInterval
    private var sleepers: [Sleeper] = []
    private var cancelled: Set<Int> = []
    private var nextID = 0
    private var registrations = 0

    public init(start: TimeInterval = 1_000) {
        current = start
    }

    public func now() -> TimeInterval {
        lock.lock()
        defer { lock.unlock() }
        return current
    }

    public func sleep(for seconds: TimeInterval) async throws {
        let id: Int = lock.withLock {
            nextID += 1
            return nextID
        }
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                lock.lock()
                if cancelled.remove(id) != nil || Task.isCancelled {
                    lock.unlock()
                    continuation.resume(throwing: CancellationError())
                    return
                }
                sleepers.append(Sleeper(id: id, wakeTime: current + seconds, continuation: continuation))
                registrations += 1
                lock.unlock()
            }
        } onCancel: {
            lock.lock()
            if let index = sleepers.firstIndex(where: { $0.id == id }) {
                let sleeper = sleepers.remove(at: index)
                lock.unlock()
                sleeper.continuation.resume(throwing: CancellationError())
            } else {
                cancelled.insert(id)
                lock.unlock()
            }
        }
    }

    /// Setzt die Uhr direkt (ohne Schlafende zu wecken); fuer Tests ohne Tick-Schleife.
    public func set(_ time: TimeInterval) {
        lock.withLock { current = time }
    }

    /// Wartet, bis mindestens ein Schlafender registriert ist (z. B. die Tick-Schleife der Engine).
    public func waitForSleeper() async {
        while lock.withLock({ sleepers.isEmpty }) {
            await Self.backoff()
        }
    }

    /// Stellt die Zeit um `seconds` vor und weckt dabei jeden faelligen Schlafenden einzeln.
    public func advance(by seconds: TimeInterval) async {
        let target = now() + seconds
        await waitForSleeper()
        while true {
            let due: (Sleeper, Int)? = lock.withLock {
                guard let next = sleepers.min(by: { $0.wakeTime < $1.wakeTime }), next.wakeTime <= target + 1e-9 else {
                    return nil
                }
                sleepers.removeAll { $0.id == next.id }
                current = max(current, next.wakeTime)
                return (next, registrations)
            }
            guard let (sleeper, before) = due else { break }
            sleeper.continuation.resume()
            // Der Geweckte verarbeitet seinen Tick und schlaeft danach erneut.
            while lock.withLock({ registrations == before }) {
                await Self.backoff()
                if Task.isCancelled { return }
            }
        }
        lock.withLock { current = max(current, target) }
    }

    private static func backoff() async {
        for _ in 0..<20 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 50_000)
    }
}
