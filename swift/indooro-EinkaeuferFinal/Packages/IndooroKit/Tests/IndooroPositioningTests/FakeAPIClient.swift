import Foundation
import IndooroNetworking

/// API-Client fuer die Tests: je Pfad eine feste Antwort (Bytes oder Fehler). Alle Aufrufe werden gezaehlt.
final class FakeAPIClient: APIClientProtocol, @unchecked Sendable {
    private let lock = NSLock()
    private var responses: [String: Result<Data, APIError>] = [:]
    private var counts: [String: Int] = [:]

    func respond(_ path: String, with result: Result<Data, APIError>) {
        lock.withLock { responses[path] = result }
    }

    func callCount(_ path: String) -> Int {
        lock.withLock { counts[path, default: 0] }
    }

    func send<E: Endpoint>(_ endpoint: E) async throws(APIError) -> E.Response {
        let path = endpoint.path
        let result: Result<Data, APIError> = lock.withLock {
            counts[path, default: 0] += 1
            return responses[path] ?? .failure(.http(status: 404, message: nil))
        }
        let data = try result.get()
        if E.Response.self == RawJSON.self, let raw = RawJSON(data: data) as? E.Response {
            return raw
        }
        do {
            return try JSONCoding.makeDecoder().decode(E.Response.self, from: data)
        } catch {
            throw .decoding(String(describing: error))
        }
    }

    func fire<E: Endpoint>(_ endpoint: E) async {
        _ = try? await send(endpoint)
    }
}
