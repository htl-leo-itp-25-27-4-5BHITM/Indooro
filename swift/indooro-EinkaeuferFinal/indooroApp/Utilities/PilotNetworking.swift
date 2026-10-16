import Foundation

extension JSONDecoder {
    static var indooro: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { value in
            let text = try value.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: text) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: text) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: value.codingPath, debugDescription: "Ungültiges Datum"))
        }
        return decoder
    }
}

struct LossyDecodableArray<Element: Decodable>: Decodable {
    let elements: [Element]
    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var items: [Element] = []
        while !container.isAtEnd {
            // superDecoder consumes one complete element even if its model is invalid.
            let value = try container.superDecoder()
            if let item = try? Element(from: value) { items.append(item) }
        }
        elements = items
    }
}

enum PilotSearchURL {
    static func make(base: URL, query: String?, size: Int, storeID: UUID?, storeCode: String?) -> URL? {
        var parts = URLComponents(url: base.appendingPathComponent(query == nil ? "products" : "products/search"), resolvingAgainstBaseURL: false)
        var items = [URLQueryItem(name: "size", value: String(max(1, size)))]
        if let query { items.append(URLQueryItem(name: "q", value: query)) }
        if let storeID { items.append(URLQueryItem(name: "storeId", value: storeID.uuidString)) }
        if let storeCode { items.append(URLQueryItem(name: "storeCode", value: storeCode)) }
        parts?.queryItems = items
        // Some servers decode query strings as form data, where a literal + means space.
        parts?.percentEncodedQuery = parts?.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        return parts?.url
    }
}

enum PilotHTTP {
    static func errorMessage(response: URLResponse?, error: Error?) -> String? {
        if let error = error as? URLError {
            return error.code == .timedOut ? "Die Anfrage hat zu lange gedauert." : "Die Verbindung zum Server ist nicht verfügbar."
        }
        if error != nil { return "Die Verbindung zum Server ist fehlgeschlagen." }
        guard let response = response as? HTTPURLResponse else { return "Keine gültige Serverantwort erhalten." }
        guard (200...299).contains(response.statusCode) else { return "Der Server meldet einen Fehler (HTTP \(response.statusCode))." }
        return nil
    }
}
