import Foundation

/// Wiederholungsregel fuer einen Endpoint. Der Client wendet sie nur auf `GET` an;
/// `POST` wird nie automatisch wiederholt, unabhaengig von dieser Regel.
public struct RetryPolicy: Sendable, Equatable {
    /// Anzahl Wiederholungen nach dem ersten Versuch.
    public let maxRetries: Int
    /// Basisverzoegerung in Sekunden; Wiederholung `n` (0-basiert) wartet `base * 2^n` plus Jitter.
    public let baseDelay: TimeInterval
    /// Obergrenze des zufaelligen Jitters in Sekunden (Wert liegt in `0...maxJitter`).
    public let maxJitter: TimeInterval

    public init(maxRetries: Int, baseDelay: TimeInterval = 0.5, maxJitter: TimeInterval = 0.25) {
        self.maxRetries = max(0, maxRetries)
        self.baseDelay = baseDelay
        self.maxJitter = maxJitter
    }

    /// Keine Wiederholung.
    public static let none = RetryPolicy(maxRetries: 0)

    /// Lesende Anfragen: hoechstens zwei Wiederholungen mit 0,5 s und 1,0 s plus bis zu 250 ms Jitter.
    public static let idempotentRead = RetryPolicy(maxRetries: 2)

    /// Lesende Anfragen, auf die der Nutzer im Laden wartet (Produkte, Rezepte): eine Wiederholung nach
    /// 0,5 s plus bis zu 250 ms Jitter. Mit 10 s Timeout je Versuch dauert der Fehlerfall hoechstens etwa 21 s.
    public static let interactiveRead = RetryPolicy(maxRetries: 1)

    /// Verzoegerung vor der Wiederholung `retry` (0-basiert). `jitter` erhaelt die Obergrenze und liefert
    /// einen Wert in `0...upperBound`; in Tests wird ein fester Wert injiziert.
    public func delay(forRetry retry: Int, jitter: (TimeInterval) -> TimeInterval) -> Duration {
        let exponential = baseDelay * pow(2, Double(retry))
        let randomPart = min(max(jitter(maxJitter), 0), maxJitter)
        return .seconds(exponential + randomPart)
    }

    /// Nur Transportfehler und die Statuscodes 502, 503 und 504 sind wiederholbar.
    /// `.offline`, `.cancelled`, Dekodierfehler und alle anderen HTTP-Statuscodes nicht.
    public static func isRetryable(_ error: APIError) -> Bool {
        switch error {
        case .transport(let code):
            return code == .timedOut || code == .networkConnectionLost || code == .cannotConnectToHost
        case .http(let status, _):
            return status == 502 || status == 503 || status == 504
        case .offline, .decoding, .cancelled:
            return false
        }
    }
}

/// Wartet zwischen Wiederholungen. Tests injizieren einen Sleeper, der sofort zurueckkehrt.
public protocol RetrySleeper: Sendable {
    func sleep(for duration: Duration) async throws
}

/// Echter Sleeper auf Basis von `Task.sleep`.
public struct SystemSleeper: RetrySleeper {
    public init() {}

    public func sleep(for duration: Duration) async throws {
        try await Task.sleep(for: duration)
    }
}
