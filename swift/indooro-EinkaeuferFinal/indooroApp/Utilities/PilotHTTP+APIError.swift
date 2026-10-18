import Foundation
import IndooroNetworking

extension PilotHTTP {
    /// Nutzertext für einen Fehler des `APIClient`. Liefert dieselben Texte wie `errorMessage(response:error:)`:
    /// Server-Fehlertexte aus dem Body werden bewusst nicht angezeigt, nur der HTTP-Status.
    static func message(for error: APIError) -> String {
        switch error {
        case .transport(let code) where code == .timedOut:
            return "Die Anfrage hat zu lange gedauert."
        case .http(let status, _):
            return "Der Server meldet einen Fehler (HTTP \(status))."
        case .decoding:
            return "Keine gültige Serverantwort erhalten."
        case .offline, .transport, .cancelled:
            return "Die Verbindung zum Server ist nicht verfügbar."
        }
    }
}
