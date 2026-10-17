import Foundation

/// Baut die URLs fuer Produktabfragen der App. Reine Foundation ohne App-Abhaengigkeiten,
/// damit die Logik auch im SwiftPM-Testpaket laeuft.
///
/// Jede Produktanfrage traegt `storeCode=<Filialcode>` als letzten Parameter, sofern eine
/// Filiale bekannt ist. Ohne (oder mit leerem) Filialcode entsteht die alte URL ohne Parameter.
enum ProductEndpoint {
    /// Erlaubte Zeichen im Filialcode: ASCII-Buchstaben, Ziffern und `-._~`.
    /// Alles andere (Leerzeichen, `/`, `&`, `=`, ...) wird prozentkodiert.
    private static let storeCodeAllowed = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    )

    /// Suchtext: `.urlQueryAllowed` ohne Trennzeichen, damit ein `&` im Suchtext keine
    /// Parameter (z. B. `storeCode`) einschleusen kann.
    private static let queryValueAllowed: CharacterSet = {
        var set = CharacterSet.urlQueryAllowed
        set.remove(charactersIn: "&+=#?")
        return set
    }()

    /// Trimmt den Filialcode. Leer oder nur Whitespace ergibt `nil`.
    static func normalizedStoreCode(_ raw: String?) -> String? {
        guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }

    /// `GET {base}/products/search?q=<q>&size=<n>[&storeCode=<code>]`
    /// Der Suchtext wird mit `.urlQueryAllowed` ohne `& + = # ?` kodiert.
    static func searchURL(base: String, query: String, size: Int, storeCode: String?) -> URL? {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: queryValueAllowed) ?? ""
        let resultSize = max(1, size)
        let urlString = "\(base)/products/search?q=\(encoded)&size=\(resultSize)"
        return URL(string: appendingStoreCode(to: urlString, storeCode: storeCode))
    }

    /// `GET {base}/products?size=<n>[&storeCode=<code>]`
    static func listURL(base: String, size: Int, storeCode: String?) -> URL? {
        let resultSize = max(1, size)
        let urlString = "\(base)/products?size=\(resultSize)"
        return URL(string: appendingStoreCode(to: urlString, storeCode: storeCode))
    }

    /// `GET {base}/products/<id>[?storeCode=<code>]`
    static func productURL(base: String, id: Int, storeCode: String?) -> URL? {
        let urlString = "\(base)/products/\(id)"
        return URL(string: appendingStoreCode(to: urlString, storeCode: storeCode))
    }

    // MARK: - Helpers

    private static func appendingStoreCode(to urlString: String, storeCode: String?) -> String {
        guard let code = normalizedStoreCode(storeCode),
              let encoded = code.addingPercentEncoding(withAllowedCharacters: storeCodeAllowed) else {
            return urlString
        }
        let separator = urlString.contains("?") ? "&" : "?"
        return "\(urlString)\(separator)storeCode=\(encoded)"
    }
}
