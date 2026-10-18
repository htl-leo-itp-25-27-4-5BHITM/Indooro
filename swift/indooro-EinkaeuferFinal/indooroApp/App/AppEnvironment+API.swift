import Foundation
import IndooroNetworking

/// App-weite Fabrik für den `APIClient` (Phase 5 von modernize-ios-client-architecture).
/// Die Basis-URL ist `AppEnvironment.apiBaseURL`, die Session `AppEnvironment.session`
/// (Timeouts und DEBUG-Beobachter bleiben unverändert). Liegt in einer eigenen Datei, damit
/// `AppEnvironment.swift` ohne IndooroNetworking-Abhängigkeit im SwiftPM-Paket `IndooroPilotSupport` bleibt.
extension AppEnvironment {
    static func makeAPIClient(session: URLSession = AppEnvironment.session) -> APIClient {
        APIClient(environment: APIEnvironment(baseURL: AppEnvironment.apiBaseURL), session: session)
    }

    /// Gemeinsamer Client für Stores ohne eigene Session.
    static let apiClient: any APIClientProtocol = makeAPIClient()
}
