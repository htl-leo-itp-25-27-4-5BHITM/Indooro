import Foundation
import IndooroTestSupport
@testable import IndooroNetworking

// Test-Doppel fuer den Transport. Die Schritte einer Session werden in der Reihenfolge abgespielt,
// jede Anfrage wird aufgezeichnet. Tests laufen seriell (XCTest-Standard), daher genuegt ein
// globaler Verweis auf das aktuelle Skript. Wird in die Test-Support-Schicht verschoben, sobald
// `IndooroTestSupport` existiert (design Decision 1).

/// Ein Antwortschritt des Stubs.
enum StubStep: Sendable {
    case respond(status: Int, body: Data = Data(), headers: [String: String] = [:])
    case fail(URLError.Code)
    /// Antwortet nicht; die Anfrage endet erst durch Abbruch des Tasks.
    case hang
}

/// Haelt die Schritte und die aufgezeichneten Anfragen. Thread-sicher ueber einen Lock.
final class StubScript: @unchecked Sendable {
    private let lock = NSLock()
    private var steps: [StubStep] = []
    private var requests: [URLRequest] = []

    func enqueue(_ newSteps: [StubStep]) {
        lock.withLock { steps.append(contentsOf: newSteps) }
    }

    var requestCount: Int {
        lock.withLock { requests.count }
    }

    var recordedRequests: [URLRequest] {
        lock.withLock { requests }
    }

    /// Protokolliert die Anfrage und liefert den naechsten Schritt (`nil`, wenn keiner mehr geplant ist).
    func record(_ request: URLRequest) -> StubStep? {
        lock.withLock {
            requests.append(request)
            return steps.isEmpty ? nil : steps.removeFirst()
        }
    }
}

enum StubRegistry {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var storage: StubScript?

    static var script: StubScript? {
        get { lock.withLock { storage } }
        set { lock.withLock { storage = newValue } }
    }
}

final class StubURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let script = StubRegistry.script else {
            client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL))
            return
        }
        switch script.record(request) {
        case .respond(let status, let body, let headers)?:
            guard let url = request.url,
                  let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) else {
                client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
                return
            }
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            if !body.isEmpty {
                client?.urlProtocol(self, didLoad: body)
            }
            client?.urlProtocolDidFinishLoading(self)
        case .fail(let code)?:
            client?.urlProtocol(self, didFailWithError: URLError(code))
        case .hang?:
            break
        case nil:
            // Unerwartete zusaetzliche Anfrage: der Test soll scheitern, nicht haengen.
            client?.urlProtocol(self, didFailWithError: URLError(.resourceUnavailable))
        }
    }

    override func stopLoading() {}
}

/// Hilfen fuer alle Netzwerktests: Client mit Stub-Session und aufzeichnendem Sleeper.
enum StubClient {
    static let environment = APIEnvironment(baseURL: URL(string: "https://example.test/api")!)

    static func make(script: StubScript, sleeper: any RetrySleeper = RecordingSleeper()) -> APIClient {
        StubRegistry.script = script
        let session = URLSession(
            configuration: environment.makeSessionConfiguration(additionalProtocolClasses: [StubURLProtocol.self])
        )
        return APIClient(environment: environment, session: session, sleeper: sleeper, jitter: { _ in 0 })
    }
}

/// Zeichnet die Wartezeiten zwischen Wiederholungen auf, ohne zu warten.
actor RecordingSleeper: RetrySleeper {
    private(set) var durations: [Duration] = []

    func sleep(for duration: Duration) async throws {
        durations.append(duration)
    }
}

/// Fixture aus `IndooroTestSupport`.
func fixtureData(_ name: String) throws -> Data {
    try TestFixtures.data(name)
}
