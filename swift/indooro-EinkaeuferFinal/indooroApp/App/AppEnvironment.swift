import Foundation

enum FeatureProfile: String {
    case pilot, full
}

/// Konfiguration für App und reine Tests. Kein Schlüssel oder Gerätebezug.
nonisolated enum AppEnvironment {
    static let profileOverrideKey = "IndooroFeatureProfileOverride"
    static let requestTimeout: TimeInterval = 15
    /// Fallback, falls Info.plist `IndooroAPIBaseURL` leer oder ungueltig ist (Build ohne Config/*.xcconfig).
    /// Die eigentliche Standard-URL kommt aus Info.plist (`$(INDOORO_API_BASE_URL)`, siehe Config/).
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

    static var isStudyModeEnabled: Bool {
        #if DEBUG
        // UI tests switch the test-lead entry on without a second build of the app.
        if ProcessInfo.processInfo.environment["INDOORO_STUDY_MODE"] == "1" { return true }
        #endif
        return Bundle.main.object(forInfoDictionaryKey: "IndooroStudyMode") as? Bool ?? false
    }

    static var allowsExtendedFeatures: Bool { featureProfile == .full }

    /// Schalter fuer den Schattenbetrieb der neuen Ortungs-Engine (`ShadowPositioning`). Standard: aus.
    /// Info.plist `IndooroShadowPositioning`; DEBUG-Builds lesen zusaetzlich `INDOORO_SHADOW_POSITIONING=1`.
    static var isShadowPositioningEnabled: Bool {
        #if DEBUG
        if ProcessInfo.processInfo.environment["INDOORO_SHADOW_POSITIONING"] == "1" { return true }
        #endif
        return Bundle.main.object(forInfoDictionaryKey: "IndooroShadowPositioning") as? Bool ?? false
    }

    /// Feldtuning der Ankunftsvorschläge. `nil` heißt: Standardwert der App (ArrivalSuggestionConfig.defaults()).
    struct ArrivalSuggestionTuning: Equatable {
        let radiusMeters: Double?
        let dwellSeconds: Double?
    }

    static let arrivalRadiusEnvironmentKey = "INDOORO_ARRIVAL_RADIUS_M"
    static let arrivalDwellEnvironmentKey = "INDOORO_ARRIVAL_DWELL_S"

    /// Positive, endliche Zahl oder `nil` (ungültige Werte und Werte <= 0 werden ignoriert).
    static func parsePositiveSetting(_ value: String?) -> Double? {
        guard let value, let number = Double(value.trimmingCharacters(in: .whitespacesAndNewlines)),
              number.isFinite, number > 0 else { return nil }
        return number
    }

    static func arrivalSuggestionTuning(environment: [String: String]) -> ArrivalSuggestionTuning {
        ArrivalSuggestionTuning(
            radiusMeters: parsePositiveSetting(environment[arrivalRadiusEnvironmentKey]),
            dwellSeconds: parsePositiveSetting(environment[arrivalDwellEnvironmentKey])
        )
    }

    /// Nur DEBUG-Builds lesen die Umgebung (wie INDOORO_API_BASE_URL); Release nimmt immer die Standardwerte.
    static var arrivalSuggestionTuning: ArrivalSuggestionTuning {
        #if DEBUG
        return arrivalSuggestionTuning(environment: ProcessInfo.processInfo.environment)
        #else
        return ArrivalSuggestionTuning(radiusMeters: nil, dwellSeconds: nil)
        #endif
    }

    static func parseAPIURL(_ value: String?) -> URL? {
        guard let value, var parts = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = parts.scheme?.lowercased(), ["https", "http"].contains(scheme),
              parts.host?.isEmpty == false, parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil,
              parts.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")) == "api" else { return nil }
        parts.path = "/api"
        return parts.url
    }

    /// Reine Aufloesung der API-Basis-URL. Eingaben werden übergeben (statt Bundle/Umgebung zu lesen),
    /// damit Standardwert, Info.plist-Wert und DEBUG-Override einzeln testbar sind.
    /// Reihenfolge: DEBUG-Umgebungsvariable `INDOORO_API_BASE_URL` (nur Debug-Builds), dann Info.plist, dann `defaultAPI`.
    static func resolveAPIBaseURL(infoPlistValue: String?, environmentValue: String?, isDebugBuild: Bool) -> URL {
        if isDebugBuild, let url = parseAPIURL(environmentValue) { return url }
        return parseAPIURL(infoPlistValue) ?? defaultAPI
    }

    static var apiBaseURL: URL {
        #if DEBUG
        let environmentValue = ProcessInfo.processInfo.environment["INDOORO_API_BASE_URL"]
        let isDebugBuild = true
        #else
        let environmentValue: String? = nil
        let isDebugBuild = false
        #endif
        return resolveAPIBaseURL(
            infoPlistValue: Bundle.main.object(forInfoDictionaryKey: "IndooroAPIBaseURL") as? String,
            environmentValue: environmentValue,
            isDebugBuild: isDebugBuild
        )
    }

    static let session: URLSession = {
        let config = URLSessionConfiguration.default
        #if DEBUG
        config.protocolClasses = [PilotRequestObserver.self] + (config.protocolClasses ?? [])
        #endif
        config.timeoutIntervalForRequest = requestTimeout
        config.timeoutIntervalForResource = requestTimeout
        return URLSession(configuration: config)
    }()
}

#if DEBUG
/// Observe request creation without intercepting transport. Never log query values or bodies.
private nonisolated final class PilotRequestObserver: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        NSLog("[PilotNetwork] %@ %@", request.httpMethod ?? "GET", request.url?.path ?? "")
        return false
    }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {}
    override func stopLoading() {}
}
#endif
