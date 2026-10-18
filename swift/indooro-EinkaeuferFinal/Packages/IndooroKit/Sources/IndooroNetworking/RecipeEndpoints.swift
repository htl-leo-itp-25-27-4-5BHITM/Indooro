import Foundation

// Rezept-Routen der anonymen Mobile-API. Lesend, daher `idempotentRead` mit 15 s Timeout.

/// `GET /mobile/recipes?page&size[&tag]`: veroeffentlichte Rezepte, seitenweise.
public struct RecipeListEndpoint: Endpoint {
    public typealias Response = Components.Schemas.RecipeSummaryPage
    public let page: Int
    public let size: Int
    public let tag: String?

    public init(page: Int = 0, size: Int = 20, tag: String? = nil) {
        self.page = page
        self.size = size
        self.tag = tag
    }

    public var method: HTTPMethod { .get }
    public var path: String { "/mobile/recipes" }
    public var timeout: Duration { .seconds(15) }
    public var retry: RetryPolicy { .idempotentRead }
    /// Legacy: `+` wird unveraendert gesendet, wie in der Pilot-App bisher (URLComponents ohne Nachbearbeitung).
    public var encodesPlusInQuery: Bool { false }

    public var query: [URLQueryItem] {
        var items = [
            URLQueryItem(name: "page", value: String(max(0, page))),
            URLQueryItem(name: "size", value: String(max(1, size))),
        ]
        if let tag, !tag.isEmpty {
            items.append(URLQueryItem(name: "tag", value: tag))
        }
        return items
    }
}

/// `GET /mobile/recipes/search?q&page&size`: Textsuche in veroeffentlichten Rezepten.
public struct RecipeSearchEndpoint: Endpoint {
    public typealias Response = Components.Schemas.RecipeSummaryPage
    public let searchText: String
    public let page: Int
    public let size: Int

    public init(searchText: String, page: Int = 0, size: Int = 20) {
        self.searchText = searchText
        self.page = page
        self.size = size
    }

    public var method: HTTPMethod { .get }
    public var path: String { "/mobile/recipes/search" }
    public var timeout: Duration { .seconds(15) }
    public var retry: RetryPolicy { .idempotentRead }
    /// Legacy: `+` wird unveraendert gesendet, wie in der Pilot-App bisher (URLComponents ohne Nachbearbeitung).
    public var encodesPlusInQuery: Bool { false }

    public var query: [URLQueryItem] {
        [
            URLQueryItem(name: "q", value: searchText.trimmingCharacters(in: .whitespacesAndNewlines)),
            URLQueryItem(name: "page", value: String(max(0, page))),
            URLQueryItem(name: "size", value: String(max(1, size))),
        ]
    }
}

/// `GET /mobile/recipes/{recipeId}`: Rezeptdetail.
public struct RecipeDetailEndpoint: Endpoint {
    public typealias Response = Components.Schemas.RecipeDetail
    public let recipeID: UUID

    public init(recipeID: UUID) {
        self.recipeID = recipeID
    }

    public var method: HTTPMethod { .get }
    public var path: String { "/mobile/recipes/\(recipeID.uuidString)" }
    public var timeout: Duration { .seconds(15) }
    public var retry: RetryPolicy { .idempotentRead }
}

/// `GET /mobile/recipes/{recipeId}/product-mapping[?storeId&storeCode]`: Zuordnung der Zutaten zu Produkten.
public struct RecipeProductMappingEndpoint: Endpoint {
    public typealias Response = Components.Schemas.RecipeProductMappingResponse
    public let recipeID: UUID
    public let storeID: UUID?
    public let storeCode: String?

    public init(recipeID: UUID, storeID: UUID? = nil, storeCode: String? = nil) {
        self.recipeID = recipeID
        self.storeID = storeID
        self.storeCode = storeCode
    }

    public var method: HTTPMethod { .get }
    public var path: String { "/mobile/recipes/\(recipeID.uuidString)/product-mapping" }
    public var timeout: Duration { .seconds(15) }
    public var retry: RetryPolicy { .idempotentRead }
    /// Legacy: `+` wird unveraendert gesendet, wie in der Pilot-App bisher (URLComponents ohne Nachbearbeitung).
    public var encodesPlusInQuery: Bool { false }

    public var query: [URLQueryItem] {
        var items: [URLQueryItem] = []
        if let storeID {
            items.append(URLQueryItem(name: "storeId", value: storeID.uuidString))
        }
        if let code = ProductEndpoint.normalizedStoreCode(storeCode) {
            items.append(URLQueryItem(name: "storeCode", value: code))
        }
        return items
    }
}
