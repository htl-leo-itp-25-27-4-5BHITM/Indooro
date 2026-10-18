import Foundation
import OSLog

/// Liefert optional einen Authorization-Header. Im aktuellen Build wird kein Provider gesetzt
/// (anonyme API); der Hook existiert, damit spaetere authentifizierte Funktionen nicht am Client vorbei gehen.
public protocol AuthorizationProvider: Sendable {
    func authorizationValue() async throws -> String?
}

/// Schnittstelle des Clients, damit Stores und Tests den Client austauschen koennen.
public protocol APIClientProtocol: Sendable {
    func send<E: Endpoint>(_ endpoint: E) async throws(APIError) -> E.Response
    func fire<E: Endpoint>(_ endpoint: E) async
}

/// Einziger Weg zum Backend: typisierte Endpoints, einheitliche Fehlerabbildung, Wiederholung nur für GET.
public actor APIClient: APIClientProtocol {
    public let environment: APIEnvironment
    private let session: URLSession
    private let sleeper: any RetrySleeper
    private let jitter: @Sendable (TimeInterval) -> TimeInterval
    private let authorization: (any AuthorizationProvider)?
    private let logger = Logger(subsystem: "at.ac.htl.leonding.indooro", category: "network")

    /// - Parameters:
    ///   - session: Standardmaessig eine Session mit `environment.makeSessionConfiguration()`.
    ///   - sleeper: Wartet zwischen Wiederholungen; Tests injizieren einen sofort zurueckkehrenden.
    ///   - jitter: Liefert einen Wert in `0...upperBound` fuer den Wiederholungs-Jitter.
    ///   - authorization: Nil in allen Builds.
    public init(
        environment: APIEnvironment,
        session: URLSession? = nil,
        sleeper: any RetrySleeper = SystemSleeper(),
        jitter: @escaping @Sendable (TimeInterval) -> TimeInterval = { upperBound in
            upperBound > 0 ? Double.random(in: 0...upperBound) : 0
        },
        authorization: (any AuthorizationProvider)? = nil
    ) {
        self.environment = environment
        self.session = session ?? URLSession(configuration: environment.makeSessionConfiguration())
        self.sleeper = sleeper
        self.jitter = jitter
        self.authorization = authorization
    }

    /// Sendet den Endpoint und liefert die dekodierte Antwort. Wiederholt nur `GET`-Anfragen gemaess `endpoint.retry`.
    public func send<E: Endpoint>(_ endpoint: E) async throws(APIError) -> E.Response {
        let request = try endpoint.urlRequest(environment: environment)
        let policy = endpoint.method == .get ? endpoint.retry : RetryPolicy.none
        var retriesUsed = 0
        while true {
            do throws(APIError) {
                return try await execute(request, as: E.Response.self)
            } catch {
                guard retriesUsed < policy.maxRetries, RetryPolicy.isRetryable(error) else {
                    throw error
                }
                let delay = policy.delay(forRetry: retriesUsed, jitter: jitter)
                retriesUsed += 1
                logger.debug("Wiederholung \(retriesUsed) nach \(error.logLabel, privacy: .public)")
                do {
                    try await sleeper.sleep(for: delay)
                } catch {
                    throw .cancelled
                }
            }
        }
    }

    /// Best-effort-Aufruf (Telemetrie, Dismiss): Fehler werden nur protokolliert, nie weitergereicht.
    public func fire<E: Endpoint>(_ endpoint: E) async {
        do {
            _ = try await send(endpoint)
        } catch {
            logger.error("Best-effort-Anfrage \(endpoint.method.rawValue, privacy: .public) fehlgeschlagen: \(error.logLabel, privacy: .public)")
        }
    }

    // MARK: - Ausfuehrung

    private func execute<R: Decodable & Sendable>(_ request: URLRequest, as type: R.Type) async throws(APIError) -> R {
        var request = request
        if let authorization {
            do {
                if let value = try await authorization.authorizationValue() {
                    request.setValue(value, forHTTPHeaderField: "Authorization")
                }
            } catch {
                throw APIError(transportError: error)
            }
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError(transportError: error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw .transport(.badServerResponse)
        }
        guard (200...299).contains(http.statusCode) else {
            throw .http(status: http.statusCode, message: Self.serverMessage(from: data))
        }
        return try Self.decode(R.self, from: data)
    }

    private static func decode<R: Decodable & Sendable>(_ type: R.Type, from data: Data) throws(APIError) -> R {
        if let empty = EmptyResponse() as? R { return empty }
        if let raw = RawJSON(data: data) as? R { return raw }
        do {
            return try JSONCoding.makeDecoder().decode(R.self, from: data)
        } catch {
            throw .decoding(String(describing: error))
        }
    }

    /// Fehlerkoerper aus `ApiWebApplicationExceptionMapper`: `{"status", "error", "method", "path", ...}`.
    /// `message` wird als Alternative akzeptiert.
    private struct ErrorBody: Decodable {
        let error: String?
        let message: String?
    }

    private static func serverMessage(from data: Data) -> String? {
        guard let body = try? JSONDecoder().decode(ErrorBody.self, from: data) else { return nil }
        let text = (body.error ?? body.message)?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let text, !text.isEmpty else { return nil }
        return text
    }
}

private extension APIError {
    /// Kurzbezeichnung ohne Nutzerdaten fuer Logs.
    var logLabel: String {
        switch self {
        case .offline: "offline"
        case .transport(let code): "transport \(code.rawValue)"
        case .http(let status, _): "http \(status)"
        case .decoding: "decoding"
        case .cancelled: "cancelled"
        }
    }
}
