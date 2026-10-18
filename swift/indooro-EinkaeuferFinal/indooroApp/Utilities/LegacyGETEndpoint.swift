import Foundation
import IndooroNetworking

/// GET auf eine bereits gebaute URL der Mobile-API, geschickt über den `APIClient`.
/// Hält das bisherige Verhalten von `BeaconManager` bei: Timeout wie `AppEnvironment.requestTimeout`,
/// keine Wiederholung, Query unverändert (`+` bleibt wörtlich). Die Antwort kommt als unveränderte Bytes (`RawJSON`).
struct LegacyGETEndpoint: Endpoint {
    typealias Response = RawJSON

    let path: String
    let query: [URLQueryItem]

    var method: HTTPMethod { .get }
    var timeout: Duration { .seconds(AppEnvironment.requestTimeout) }
    var retry: RetryPolicy { .none }
    var encodesPlusInQuery: Bool { false }

    init(path: String, query: [URLQueryItem] = []) {
        self.path = path
        self.query = query
    }

    /// Zerlegt eine absolute URL unterhalb von `AppEnvironment.apiBaseURL` in Pfad (prozentkodiert) und Query.
    /// Liefert `nil` für URLs außerhalb der API-Basis.
    init?(url: URL, base: URL = AppEnvironment.apiBaseURL) {
        var baseString = base.absoluteString
        while baseString.hasSuffix("/") { baseString.removeLast() }
        guard url.absoluteString.hasPrefix(baseString),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let baseComponents = URLComponents(string: baseString) else {
            return nil
        }
        let fullPath = components.percentEncodedPath
        let basePath = baseComponents.percentEncodedPath
        guard fullPath.hasPrefix(basePath) else { return nil }
        self.init(path: String(fullPath.dropFirst(basePath.count)), query: components.queryItems ?? [])
    }
}
