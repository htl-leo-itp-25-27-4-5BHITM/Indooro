import Foundation

enum IndooroAPI {
    static let baseURL: String = {
        #if DEBUG
        if let candidate = ProcessInfo.processInfo.environment["INDOORO_API_BASE_URL"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           let url = URL(string: candidate),
           let scheme = url.scheme?.lowercased(),
           ["http", "https"].contains(scheme),
           url.host != nil,
           url.user == nil,
           url.password == nil,
           url.query == nil,
           url.fragment == nil,
           url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")) == "api" {
            return candidate.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        #endif
        return "https://it220209.cloud.htl-leonding.ac.at/api"
    }()
}
