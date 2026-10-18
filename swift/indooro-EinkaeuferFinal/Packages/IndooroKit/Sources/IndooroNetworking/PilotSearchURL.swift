import Foundation

/// Baut die Produkt-URL fuer die Mobile-API (Kategorie oder Suche, optional Filiale).
public enum PilotSearchURL {
    public static func make(base: URL, query: String?, size: Int, storeID: UUID?, storeCode: String?) -> URL? {
        var parts = URLComponents(url: base.appendingPathComponent(query == nil ? "products" : "products/search"), resolvingAgainstBaseURL: false)
        var items = [URLQueryItem(name: "size", value: String(max(1, size)))]
        if let query { items.append(URLQueryItem(name: "q", value: query)) }
        if let storeID { items.append(URLQueryItem(name: "storeId", value: storeID.uuidString)) }
        if let storeCode { items.append(URLQueryItem(name: "storeCode", value: storeCode)) }
        parts?.queryItems = items
        // Some servers decode query strings as form data, where a literal + means space.
        let encodedQuery = parts?.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        parts?.percentEncodedQuery = encodedQuery
        return parts?.url
    }
}
