import Foundation

// Layout-Routen liefern freie JSON-Strukturen. Die Antwort wird als `RawJSON` unveraendert
// durchgereicht; die tolerante Dekodierung (`LayoutData`) bleibt in der App.
// Layout-Timeout: 20 s.

/// Kodiert ein Pfadsegment fuer freie Werte (IDs): `urlPathAllowed` ohne `/`, `?`, `#` und `%`.
enum PathSegment {
    private static let allowed: CharacterSet = {
        var set = CharacterSet.urlPathAllowed
        set.remove(charactersIn: "/?#%")
        return set
    }()

    static func encode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    }
}

/// `GET /mobile/stores/{storeId}/layout/current`: aktives Layout einer Filiale (mit `layout`-Huelle und `fallback`).
public struct StoreLayoutEndpoint: Endpoint {
    public typealias Response = RawJSON
    public let storeID: UUID

    public init(storeID: UUID) {
        self.storeID = storeID
    }

    public var method: HTTPMethod { .get }
    /// Lowercase-UUID im Pfad, wie die App es bisher sendet.
    public var path: String { "/mobile/stores/\(storeID.uuidString.lowercased())/layout/current" }
    public var timeout: Duration { .seconds(20) }
    public var retry: RetryPolicy { .idempotentRead }
}

/// `GET /layout/current`: globales Legacy-Layout-Dokument.
public struct CurrentLayoutEndpoint: Endpoint {
    public typealias Response = RawJSON

    public init() {}

    public var method: HTTPMethod { .get }
    public var path: String { "/layout/current" }
    public var timeout: Duration { .seconds(20) }
    public var retry: RetryPolicy { .idempotentRead }
}

/// `GET /layout/history?limit=<n>`: Versionsliste der Legacy-Layouts.
public struct LayoutHistoryEndpoint: Endpoint {
    public typealias Response = RawJSON
    public let limit: Int

    public init(limit: Int) {
        self.limit = limit
    }

    public var method: HTTPMethod { .get }
    public var path: String { "/layout/history" }
    public var query: [URLQueryItem] { [URLQueryItem(name: "limit", value: String(limit))] }
    public var timeout: Duration { .seconds(20) }
    public var retry: RetryPolicy { .idempotentRead }
}

/// `GET /layout/versions/{layoutId}`: eine Legacy-Layout-Version. Die ID wird im Pfad prozentkodiert.
public struct LayoutVersionEndpoint: Endpoint {
    public typealias Response = RawJSON
    public let layoutID: String

    public init(layoutID: String) {
        self.layoutID = layoutID
    }

    public var method: HTTPMethod { .get }
    public var path: String { "/layout/versions/\(PathSegment.encode(layoutID))" }
    public var timeout: Duration { .seconds(20) }
    public var retry: RetryPolicy { .idempotentRead }
}
