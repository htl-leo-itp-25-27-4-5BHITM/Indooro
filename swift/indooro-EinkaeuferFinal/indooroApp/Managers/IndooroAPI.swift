import Foundation

// Bestehender Einstiegspunkt für kompatible Aufrufer.
enum IndooroAPI {
    static var baseURL: String { AppEnvironment.apiBaseURL.absoluteString }
}
