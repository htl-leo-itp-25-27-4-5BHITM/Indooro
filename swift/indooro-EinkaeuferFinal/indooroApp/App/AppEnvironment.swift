import Foundation

enum FeatureProfile: String {
    case pilot, full
}

/// Konfiguration für App und reine Tests. Kein Schlüssel oder Gerätebezug.
enum AppEnvironment {
    static let profileOverrideKey = "IndooroFeatureProfileOverride"
    static let requestTimeout: TimeInterval = 15
    static let defaultAPI = URL(string: "https://it220209.cloud.htl-leonding.ac.at/api")!

    static func parseProfile(_ value: String?, override: String? = nil) -> FeatureProfile {
        let selection = override.flatMap { $0.isEmpty ? nil : $0 } ?? value ?? ""
        return FeatureProfile(rawValue: selection) ?? .pilot
    }

    static var featureProfile: FeatureProfile {
        #if DEBUG
        return parseProfile(Bundle.main.object(forInfoDictionaryKey: "IndooroFeatureProfile") as? String,
                            override: UserDefaults.standard.string(forKey: profileOverrideKey))
        #else
        return parseProfile(Bundle.main.object(forInfoDictionaryKey: "IndooroFeatureProfile") as? String)
        #endif
    }

    static var isStudyModeEnabled: Bool { Bundle.main.object(forInfoDictionaryKey: "IndooroStudyMode") as? Bool ?? false }

    static var allowsExtendedFeatures: Bool { featureProfile == .full }

    static func parseAPIURL(_ value: String?) -> URL? {
        guard let value, var parts = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = parts.scheme?.lowercased(), ["https", "http"].contains(scheme),
              parts.host?.isEmpty == false, parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil,
              parts.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")) == "api" else { return nil }
        parts.path = "/api"
        return parts.url
    }

    static var apiBaseURL: URL {
        #if DEBUG
        if let url = parseAPIURL(ProcessInfo.processInfo.environment["INDOORO_API_BASE_URL"]) { return url }
        #endif
        return parseAPIURL(Bundle.main.object(forInfoDictionaryKey: "IndooroAPIBaseURL") as? String) ?? defaultAPI
    }

    static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = requestTimeout
        config.timeoutIntervalForResource = requestTimeout
        return URLSession(configuration: config)
    }()
}
