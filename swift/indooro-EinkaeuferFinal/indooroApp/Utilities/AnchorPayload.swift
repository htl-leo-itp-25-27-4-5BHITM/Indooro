import IndooroModels
import Foundation
import simd

/// QR-Anker-Payload: eine URL `https://<host>/customer/?store=<storeCode>&a=<anchorId>`.
/// Die Kamera-App oeffnet dieselbe URL im Browser; die App liest sie hier ein.
nonisolated struct AnchorPayload: Equatable {
    let storeCode: String
    let anchorId: String

    static let maxStoreCodeLength = 64
    static let maxAnchorIdLength = 12

    private static let unreservedCharacters = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    )

    /// Liest eine gescannte Zeichenkette. nil, wenn es keine Anker-URL ist.
    static func parse(_ text: String) -> AnchorPayload? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = components.host, !host.isEmpty,
              components.path == "/customer" || components.path == "/customer/",
              let items = components.queryItems else {
            return nil
        }

        guard let storeCode = items.first(where: { $0.name == "store" })?.value,
              isValidStoreCode(storeCode),
              let anchorId = items.first(where: { $0.name == "a" })?.value,
              isValidAnchorId(anchorId) else {
            return nil
        }

        return AnchorPayload(storeCode: storeCode, anchorId: anchorId)
    }

    /// Baut die URL fuer den QR-Code. nil, wenn Host leer oder ein Feld ungueltig ist.
    func url(host: String) -> URL? {
        let trimmedHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedHost.isEmpty,
              !trimmedHost.contains("/"),
              Self.isValidStoreCode(storeCode),
              Self.isValidAnchorId(anchorId),
              var components = URLComponents(string: "https://\(trimmedHost)/") else {
            return nil
        }

        components.percentEncodedPath = "/customer/"
        components.percentEncodedQuery = "store=\(Self.encode(storeCode))&a=\(Self.encode(anchorId))"
        return components.url
    }

    /// Ergebnis eines Scans gegen den aktiven Store und das aktive Layout.
    static func resolve(
        _ text: String,
        activeStoreCode: String?,
        anchors: [LayoutElement]
    ) -> AnchorScanOutcome {
        guard let payload = parse(text) else {
            return .invalid
        }
        return resolve(payload, activeStoreCode: activeStoreCode, anchors: anchors)
    }

    /// Wie `resolve(_:activeStoreCode:anchors:)`, aber fuer einen bereits geparsten Payload.
    static func resolve(
        _ payload: AnchorPayload,
        activeStoreCode: String?,
        anchors: [LayoutElement]
    ) -> AnchorScanOutcome {
        guard let activeStoreCode,
              payload.storeCode.lowercased() == activeStoreCode.lowercased() else {
            return .storeMismatch(storeCode: payload.storeCode)
        }

        guard let anchor = anchors.first(where: { $0.isAnchor && $0.anchorId == payload.anchorId }) else {
            return .unknownAnchor
        }

        let width = anchor.width ?? 1
        let height = anchor.height ?? 1
        let center = SIMD2<Float>(
            Float(anchor.x + width / 2),
            Float(anchor.y + height / 2)
        )
        return .setPosition(anchorId: payload.anchorId, point: center)
    }

    private static func isValidStoreCode(_ code: String) -> Bool {
        !code.trimmingCharacters(in: .whitespaces).isEmpty && code.count <= maxStoreCodeLength
    }

    private static func isValidAnchorId(_ id: String) -> Bool {
        guard (1...maxAnchorIdLength).contains(id.count) else { return false }
        return id.unicodeScalars.allSatisfy { scalar in
            (scalar >= "A" && scalar <= "Z") || (scalar >= "0" && scalar <= "9") || scalar == "-"
        }
    }

    private static func encode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreservedCharacters) ?? value
    }
}

nonisolated enum AnchorScanOutcome: Equatable {
    /// Position auf den Mittelpunkt des Ankers setzen (Layout-Koordinaten).
    case setPosition(anchorId: String, point: SIMD2<Float>)
    /// Der Code gehoert zu einer anderen Filiale (oder es ist keine Filiale aktiv).
    case storeMismatch(storeCode: String)
    /// Store passt, aber der Anker ist im aktiven Layout nicht vorhanden.
    case unknownAnchor
    /// Kein gueltiger Anker-Code.
    case invalid
}

/// Gescannter Anker, dessen Filiale erst geladen werden muss.
nonisolated struct PendingAnchorScan: Equatable {
    let payload: AnchorPayload

    /// nil, solange der aktive Store (case-insensitiv) noch nicht der Store des Payloads ist
    /// (Layout laedt noch). Sonst das Ergebnis gegen die Anker des aktiven Layouts.
    func resolve(activeStoreCode: String?, anchors: [LayoutElement]) -> AnchorScanOutcome? {
        guard let activeStoreCode,
              payload.storeCode.lowercased() == activeStoreCode.lowercased() else {
            return nil
        }
        return AnchorPayload.resolve(payload, activeStoreCode: activeStoreCode, anchors: anchors)
    }
}
