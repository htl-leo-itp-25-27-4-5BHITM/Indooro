import Foundation

/// Verteilt Werte an beliebig viele `AsyncStream`-Leser. Jeder Aufruf von `makeStream()` liefert einen eigenen
/// Strom; `send` ist von jedem Thread aus erlaubt. Die Funk- und Sensor-Adapter verwenden ihn fuer `samples()`.
public final class StreamBroadcaster<Element: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var continuations: [UUID: AsyncStream<Element>.Continuation] = [:]

    public init() {}

    public func makeStream() -> AsyncStream<Element> {
        let (stream, continuation) = AsyncStream<Element>.makeStream(bufferingPolicy: .bufferingNewest(256))
        let id = UUID()
        lock.withLock { continuations[id] = continuation }
        continuation.onTermination = { [weak self] _ in
            self?.lock.withLock { _ = self?.continuations.removeValue(forKey: id) }
        }
        return stream
    }

    public func send(_ element: Element) {
        let targets = lock.withLock { Array(continuations.values) }
        for continuation in targets { continuation.yield(element) }
    }

    public func finish() {
        let targets = lock.withLock { () -> [AsyncStream<Element>.Continuation] in
            let all = Array(continuations.values)
            continuations.removeAll()
            return all
        }
        for continuation in targets { continuation.finish() }
    }
}
