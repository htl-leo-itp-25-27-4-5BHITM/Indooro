import Foundation

/// Fehler des API-Clients. Die Faelle entsprechen `ios-backend-integration`; `message` liefert den
/// deutschen Nutzertext (Texte wie bisher in `PilotHTTP.errorMessage`, mit Umlauten).
public enum APIError: Error, Sendable, Equatable {
    /// Geraet hat keine Netzverbindung (`URLError.notConnectedToInternet`). Wird nicht wiederholt.
    case offline
    /// Uebrige Transportfehler, z. B. Timeout, Verbindungsabbruch, Host nicht erreichbar.
    case transport(URLError.Code)
    /// Nicht-2xx-Antwort. `message` stammt aus dem Fehlerkoerper des Backends (`error` oder `message`), falls vorhanden.
    case http(status: Int, message: String?)
    /// Antwort konnte nicht gelesen werden; die Beschreibung ist nur fuer Logs gedacht.
    case decoding(String)
    /// Anfrage wurde abgebrochen (Task-Cancellation).
    case cancelled

    public var message: String {
        switch self {
        case .offline:
            return "Die Verbindung zum Server ist nicht verfügbar."
        case .transport(let code) where code == .timedOut:
            return "Die Anfrage hat zu lange gedauert."
        case .transport:
            return "Die Verbindung zum Server ist nicht verfügbar."
        case .http(let status, let message):
            if let message, !message.isEmpty { return message }
            return "Der Server meldet einen Fehler (HTTP \(status))."
        case .decoding:
            return "Die Antwort des Servers konnte nicht gelesen werden."
        case .cancelled:
            return "Die Anfrage wurde abgebrochen."
        }
    }

    /// Ordnet einen Fehler der Transportschicht zu. `URLError.cancelled` und `CancellationError` werden zu `.cancelled`.
    public init(transportError error: any Error) {
        if error is CancellationError {
            self = .cancelled
        } else if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet: self = .offline
            case .cancelled: self = .cancelled
            default: self = .transport(urlError.code)
            }
        } else {
            self = .transport(.unknown)
        }
    }
}
