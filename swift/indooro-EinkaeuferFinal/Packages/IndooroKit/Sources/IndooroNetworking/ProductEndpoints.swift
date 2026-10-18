import Foundation

// Produkt-Routen. Die Query-Reihenfolge und der Filialcode entsprechen `ProductEndpoint`
// (`ProductEndpoint.swift`): gleiche Trimmung des Filialcodes, `size` mindestens 1.
// Fuer einfache Filialcodes (ohne Sonderzeichen) ist die URL identisch zu `ProductEndpoint.searchURL`/`listURL`;
// die Prozentkodierung nutzt `URLComponents`.

/// `GET /products/search?q&size[&storeCode]`.
public struct ProductSearchEndpoint: Endpoint {
    public typealias Response = [Components.Schemas.Product]
    public let searchText: String
    public let size: Int
    public let storeCode: String?

    public init(query: String, size: Int = 50, storeCode: String? = nil) {
        self.searchText = query
        self.size = size
        self.storeCode = storeCode
    }

    public var method: HTTPMethod { .get }
    public var path: String { "/products/search" }
    public var timeout: Duration { .seconds(15) }
    public var retry: RetryPolicy { .idempotentRead }

    public var query: [URLQueryItem] {
        var items = [
            URLQueryItem(name: "q", value: searchText),
            URLQueryItem(name: "size", value: String(max(1, size))),
        ]
        if let code = ProductEndpoint.normalizedStoreCode(storeCode) {
            items.append(URLQueryItem(name: "storeCode", value: code))
        }
        return items
    }
}

/// `GET /products?size[&storeCode]`: Kategorie- bzw. Gesamtliste.
public struct ProductListEndpoint: Endpoint {
    public typealias Response = [Components.Schemas.Product]
    public let size: Int
    public let storeCode: String?

    public init(size: Int = 50, storeCode: String? = nil) {
        self.size = size
        self.storeCode = storeCode
    }

    public var method: HTTPMethod { .get }
    public var path: String { "/products" }
    public var timeout: Duration { .seconds(15) }
    public var retry: RetryPolicy { .idempotentRead }

    public var query: [URLQueryItem] {
        var items = [URLQueryItem(name: "size", value: String(max(1, size)))]
        if let code = ProductEndpoint.normalizedStoreCode(storeCode) {
            items.append(URLQueryItem(name: "storeCode", value: code))
        }
        return items
    }
}

/// `GET /products[/search]?size[&q][&storeId][&storeCode]`: Produktliste der Pilot-App.
/// Query-Reihenfolge und Pfad entsprechen `PilotSearchURL.make` (mit `searchText`: Suche, ohne: Liste).
/// Die Antwort kommt als `RawJSON`, weil die App Listen tolerant dekodiert (`ProductSearchStore.decodeProducts`).
public struct ProductCollectionEndpoint: Endpoint {
    public typealias Response = RawJSON
    public let searchText: String?
    public let size: Int
    public let storeID: UUID?
    public let storeCode: String?

    public init(searchText: String?, size: Int, storeID: UUID? = nil, storeCode: String? = nil) {
        self.searchText = searchText
        self.size = size
        self.storeID = storeID
        self.storeCode = storeCode
    }

    public var method: HTTPMethod { .get }
    public var path: String { searchText == nil ? "/products" : "/products/search" }
    public var timeout: Duration { .seconds(15) }
    public var retry: RetryPolicy { .idempotentRead }

    public var query: [URLQueryItem] {
        var items = [URLQueryItem(name: "size", value: String(max(1, size)))]
        if let searchText {
            items.append(URLQueryItem(name: "q", value: searchText))
        }
        if let storeID {
            items.append(URLQueryItem(name: "storeId", value: storeID.uuidString))
        }
        if let code = ProductEndpoint.normalizedStoreCode(storeCode) {
            items.append(URLQueryItem(name: "storeCode", value: code))
        }
        return items
    }
}
