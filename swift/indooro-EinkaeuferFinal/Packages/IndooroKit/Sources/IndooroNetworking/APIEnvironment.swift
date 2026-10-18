import Foundation

/// Basis-URL und Session-Konfiguration der Mobile-API. Enthaelt keine Zugangsdaten und keine Geraete-IDs.
public struct APIEnvironment: Sendable, Equatable {
    /// Basis-URL inklusive Praefix `/api`, z. B. `https://it220209.cloud.htl-leonding.ac.at/api`.
    /// Endpoint-Pfade beginnen mit `/mobile/...` bzw. `/products...` und werden daran angehaengt.
    public let baseURL: URL

    public init(baseURL: URL) {
        self.baseURL = baseURL
    }

    /// Fallback der App, falls `Info.plist` keinen gueltigen Wert liefert (identisch zu `AppEnvironment.defaultAPI`).
    public static let leoCloud = APIEnvironment(
        baseURL: URL(string: "https://it220209.cloud.htl-leonding.ac.at/api")!
    )

    /// Erzeugt die Session-Konfiguration: keine Wartezeit auf Konnektivitaet (Fehler kommen sofort),
    /// Standard-Cache-Policy des Protokolls, Accept- und Accept-Language-Header.
    /// `additionalProtocolClasses` ist nur fuer Tests gedacht (StubURLProtocol).
    public func makeSessionConfiguration(additionalProtocolClasses: [AnyClass] = []) -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.default
        configuration.waitsForConnectivity = false
        configuration.requestCachePolicy = .useProtocolCachePolicy
        configuration.httpAdditionalHeaders = [
            "Accept": "application/json",
            "Accept-Language": "de-AT",
        ]
        if !additionalProtocolClasses.isEmpty {
            configuration.protocolClasses = additionalProtocolClasses + (configuration.protocolClasses ?? [])
        }
        return configuration
    }
}
