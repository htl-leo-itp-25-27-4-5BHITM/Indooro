import Foundation

// Anonyme Store-Routen der Mobile-API (`ios-backend-integration`). Response-Typen sind die
// generierten Wire-Typen aus `openapi.yaml`; die Zuordnung zu Domain-Modellen folgt mit Phase 2c.

/// `GET /mobile/stores`: aktive Filialen, nach Name sortiert.
public struct ListStoresEndpoint: Endpoint {
    public typealias Response = [Components.Schemas.MobileStoreSummary]
    public let method = HTTPMethod.get
    public let path = "/mobile/stores"
    public let timeout = Duration.seconds(15)
    public let retry = RetryPolicy.idempotentRead

    public init() {}
}

/// `GET /mobile/stores/beacon-identities`: UUID-Katalog fuer Ranging-Constraints.
public struct BeaconIdentitiesEndpoint: Endpoint {
    public typealias Response = Components.Schemas.BeaconIdentitiesResponse
    public let method = HTTPMethod.get
    public let path = "/mobile/stores/beacon-identities"
    public let timeout = Duration.seconds(15)
    public let retry = RetryPolicy.idempotentRead

    public init() {}
}

/// `GET /mobile/stores/by-beacon?uuid&major&minor`: Filiale zu einem erkannten Beacon.
/// `major` und `minor` werden nur gemeinsam gesendet (Backend-Vertrag); fehlt einer, entfallen beide.
public struct StoreByBeaconEndpoint: Endpoint {
    public typealias Response = Components.Schemas.StoreByBeaconResponse
    public let uuid: String
    public let major: Int?
    public let minor: Int?

    public init(uuid: String, major: Int? = nil, minor: Int? = nil) {
        self.uuid = uuid
        self.major = major
        self.minor = minor
    }

    public var method: HTTPMethod { .get }
    public var path: String { "/mobile/stores/by-beacon" }
    public var timeout: Duration { .seconds(15) }
    public var retry: RetryPolicy { .idempotentRead }

    public var query: [URLQueryItem] {
        var items = [URLQueryItem(name: "uuid", value: uuid)]
        if let major, let minor {
            items.append(URLQueryItem(name: "major", value: String(major)))
            items.append(URLQueryItem(name: "minor", value: String(minor)))
        }
        return items
    }
}
