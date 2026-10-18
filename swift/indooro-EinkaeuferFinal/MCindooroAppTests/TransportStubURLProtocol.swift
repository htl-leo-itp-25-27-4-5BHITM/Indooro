import Foundation
import IndooroNetworking

/// Transport-Doppel für Store-Tests (Phase 5, task 6.4). Zeichnet jede Anfrage auf und antwortet über einen Handler.
/// Antworten können verzögert oder gar nicht kommen (`.hang`), damit Abbruch und Reihenfolge testbar sind.
final class TransportStubURLProtocol: URLProtocol {
    enum Reply {
        case respond(status: Int, body: Data)
        case delayed(seconds: Double, status: Int, body: Data)
        case fail(URLError.Code)
        case hang
    }

    private static let lock = NSLock()
    private static var handler: ((URLRequest) -> Reply)?
    private static var recorded: [URLRequest] = []
    private static var stopped = 0

    static func install(_ handler: @escaping (URLRequest) -> Reply) {
        lock.lock()
        defer { lock.unlock() }
        self.handler = handler
        recorded = []
        stopped = 0
    }

    static func clear() {
        lock.lock()
        defer { lock.unlock() }
        handler = nil
        recorded = []
        stopped = 0
    }

    static var requests: [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }

    /// Anzahl der Anfragen, deren Ladevorgang abgebrochen wurde (Task-Abbruch).
    static var stopCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return stopped
    }

    static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportStubURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        Self.lock.lock()
        Self.recorded.append(request)
        let handler = Self.handler
        Self.lock.unlock()

        switch handler?(request) ?? .respond(status: 500, body: Data()) {
        case .respond(let status, let body):
            deliver(status: status, body: body)
        case .delayed(let seconds, let status, let body):
            DispatchQueue.global().asyncAfter(deadline: .now() + seconds) { [self] in
                self.deliver(status: status, body: body)
            }
        case .fail(let code):
            client?.urlProtocol(self, didFailWithError: URLError(code))
        case .hang:
            break
        }
    }

    override func stopLoading() {
        Self.lock.lock()
        Self.stopped += 1
        Self.lock.unlock()
    }

    private func deliver(status: Int, body: Data) {
        guard let url = request.url,
              let response = HTTPURLResponse(
                url: url,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
              ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
}

/// Wartet nicht; die Wiederholungen laufen sofort, damit Tests schnell bleiben.
struct ImmediateSleeper: RetrySleeper {
    func sleep(for duration: Duration) async throws {}
}

/// Client der App-Stores mit Stub-Transport. Basis-URL ist fest, damit URLs in Tests exakt verglichen werden.
enum StoreTestClient {
    static let baseURL = "https://example.test/api"

    static func make() -> APIClient {
        APIClient(
            environment: APIEnvironment(baseURL: URL(string: baseURL)!),
            session: TransportStubURLProtocol.makeSession(),
            sleeper: ImmediateSleeper(),
            jitter: { _ in 0 }
        )
    }
}
