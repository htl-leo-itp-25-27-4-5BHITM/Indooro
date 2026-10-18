import Foundation

/// HTTP-Methoden, die die Mobile-API verwendet.
public enum HTTPMethod: String, Sendable, Equatable {
    case get = "GET"
    case post = "POST"
}

/// Beschreibt einen Backend-Aufruf mit typisierter Antwort. Die Pfade sind relativ zur
/// `APIEnvironment.baseURL` (z. B. `/mobile/stores`). Pfadsegmente mit freien Werten
/// (IDs) muss der Endpoint selbst prozentkodieren.
public protocol Endpoint: Sendable {
    associatedtype Response: Decodable & Sendable
    var method: HTTPMethod { get }
    var path: String { get }
    var query: [URLQueryItem] { get }
    var body: (any Encodable & Sendable)? { get }
    var timeout: Duration { get }
    var retry: RetryPolicy { get }
    /// `+` in Query-Werten als `%2B` kodieren (Standard). Rezept-Routen senden `+` unveraendert, wie die Pilot-App bisher.
    var encodesPlusInQuery: Bool { get }
}

extension Endpoint {
    public var query: [URLQueryItem] { [] }
    public var body: (any Encodable & Sendable)? { nil }
    public var encodesPlusInQuery: Bool { true }

    /// Gleicher Endpoint, aber die Antwort wird als unveraenderte Bytes (`RawJSON`) geliefert.
    /// Fuer Antworten, die die App selbst tolerant dekodiert (Produkt- und Rezeptlisten, Upsell-Plan).
    public var asRaw: RawResponseEndpoint<Self> {
        RawResponseEndpoint(self)
    }
}

/// Huellt einen Endpoint und ersetzt nur die Antwort durch `RawJSON`. Alle Anfrageeigenschaften bleiben gleich.
public struct RawResponseEndpoint<Base: Endpoint>: Endpoint {
    public typealias Response = RawJSON
    public let base: Base

    public init(_ base: Base) {
        self.base = base
    }

    public var method: HTTPMethod { base.method }
    public var path: String { base.path }
    public var query: [URLQueryItem] { base.query }
    public var body: (any Encodable & Sendable)? { base.body }
    public var timeout: Duration { base.timeout }
    public var retry: RetryPolicy { base.retry }
    public var encodesPlusInQuery: Bool { base.encodesPlusInQuery }
}

/// Antwort ohne ausgewerteten Inhalt (Fire-and-forget-Aufrufe). Der Body wird ignoriert.
public struct EmptyResponse: Decodable, Sendable, Equatable {
    public init() {}
    public init(from decoder: any Decoder) throws {}
}

/// Unveraenderte JSON-Antwort fuer freie Strukturen (Layouts). Der Client reicht die Bytes
/// unveraendert durch; die tolerante Dekodierung bleibt bei der App (`LayoutData`).
public struct RawJSON: Decodable, Sendable, Equatable {
    public let data: Data

    public init(data: Data) {
        self.data = data
    }

    /// Fallback fuer Dekodierung ausserhalb des Clients: Der Wert wird als JSON-Baum gelesen und neu kodiert.
    /// Ueber `APIClient` werden die Originalbytes verwendet.
    public init(from decoder: any Decoder) throws {
        let value = try JSONValue(from: decoder)
        data = try JSONEncoder().encode(value)
    }
}

/// Beliebiger JSON-Wert als Sendable-Baum (nur fuer `RawJSON.init(from:)`).
indirect enum JSONValue: Decodable, Sendable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }
}

extension JSONValue: Encodable {
    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }
}

extension Endpoint {
    /// Baut die vollstaendige Anfrage: Basis-URL + Pfad + Query, Methode, Timeout, Body als JSON.
    /// `+` in Query-Werten wird als `%2B` kodiert, weil Server Formulardekodierung verwenden koennen.
    public func urlRequest(environment: APIEnvironment) throws(APIError) -> URLRequest {
        var base = environment.baseURL.absoluteString
        while base.hasSuffix("/") { base.removeLast() }
        guard let url = URL(string: base + path),
              var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw .transport(.badURL)
        }
        if !query.isEmpty {
            components.queryItems = query
            if encodesPlusInQuery {
                components.percentEncodedQuery = components.percentEncodedQuery?
                    .replacingOccurrences(of: "+", with: "%2B")
            }
        }
        guard let finalURL = components.url else {
            throw .transport(.badURL)
        }

        var request = URLRequest(url: finalURL)
        request.httpMethod = method.rawValue
        request.timeoutInterval = timeout.timeInterval
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            do {
                request.httpBody = try JSONCoding.makeEncoder().encode(body)
            } catch {
                throw .decoding("Anfrage konnte nicht kodiert werden: \(error)")
            }
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }
}

extension Duration {
    /// Sekunden als `TimeInterval` (fuer `URLRequest.timeoutInterval`).
    var timeInterval: TimeInterval {
        let parts = components
        return TimeInterval(parts.seconds) + TimeInterval(parts.attoseconds) / 1_000_000_000_000_000_000
    }
}
