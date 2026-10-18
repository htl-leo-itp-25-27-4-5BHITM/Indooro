import Foundation

public struct LayoutData: Codable, Sendable {
    public let shopName: String
    public let gridSize: GridSize
    public let elements: [LayoutElement]
    public let exportDate: String?
    public let layoutId: String?
    public let savedAt: String?
    public let recordType: String?

    private enum CodingKeys: String, CodingKey {
        case shopName
        case gridSize
        case elements
        case exportDate
        case layoutId
        case savedAt
        case recordType
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        shopName = try container.decode(String.self, forKey: .shopName)
        gridSize = try container.decode(GridSize.self, forKey: .gridSize)
        elements = try container.decode([LayoutElement].self, forKey: .elements)
        exportDate = try container.decodeIfPresent(String.self, forKey: .exportDate)
        layoutId = try container.decodeFlexibleStringIfPresent(forKey: .layoutId)
        savedAt = try container.decodeIfPresent(String.self, forKey: .savedAt)
        recordType = try container.decodeIfPresent(String.self, forKey: .recordType)
    }
}

public struct GridSize: Codable, Sendable {
    public let width: Double
    public let height: Double

    public init(width: Double, height: Double) {
        self.width = width
        self.height = height
    }
}

public struct LayoutElement: Codable, Identifiable, Sendable {
    public let id: Int64
    public let type: String
    public let beaconId: String?
    public let beaconUUID: String?
    public let beaconMajor: Int?
    public let beaconMinor: Int?
    public let x: Double
    public let y: Double
    public let width: Double?
    public let height: Double?
    public let color: String?
    public let label: String?
    public let category: String?
    public let meter: Int?
    public let rotation: Double?
    public let accessAngle: Double?
    public let locked: Bool?
    /// Nur fuer `type == "anchor"`: QR-Anker-Kennung (`[A-Z0-9-]{1,12}`, eindeutig pro Layout).
    public let anchorId: String?

    public var isBeacon: Bool {
        type == "beacon"
    }

    public var isAnchor: Bool {
        type == "anchor"
    }

    public var categoryBase: String? {
        guard let category else { return nil }
        return category.split(separator: "/").first.map(String.init)
    }

    public var effectiveMeter: Int? {
        meter ?? Self.parseMeter(from: category)
    }

    public var resolvedCategoryCode: String? {
        guard let categoryBase else { return nil }
        if let effectiveMeter {
            return "\(categoryBase)/\(effectiveMeter)"
        }
        return categoryBase
    }

    /// Match a product's complete category segment, not a numeric prefix such as 31 in 310.
    /// Layout codes need at least two segments with a numeric second segment (meter).
    /// An element without a meter matches any meter.
    public func matchesProductLayoutCode(_ layoutCode: String) -> Bool {
        let parts = layoutCode.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count >= 2,
              let categoryBase,
              categoryBase == String(parts[0]),
              let productMeter = Int(parts[1]) else { return false }
        return effectiveMeter.map { $0 == productMeter } ?? true
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case type
        case beaconId
        case beaconUUID
        case beaconMajor
        case beaconMinor
        case x
        case y
        case width
        case height
        case color
        case label
        case category
        case meter
        case rotation
        case accessAngle
        case locked
        case anchorId
    }

    private enum AliasCodingKeys: String, CodingKey {
        case uuid
        case major
        case minor
        case beaconCode
        case identityKey
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let aliasContainer = try decoder.container(keyedBy: AliasCodingKeys.self)
        let decodedIdentity = try aliasContainer.decodeIfPresent(String.self, forKey: .identityKey)
        let identityParts = Self.parseIdentity(from: decodedIdentity)

        id = try container.decode(Int64.self, forKey: .id)
        type = try container.decode(String.self, forKey: .type)
        beaconId = try container.decodeIfPresent(String.self, forKey: .beaconId)
            ?? aliasContainer.decodeIfPresent(String.self, forKey: .beaconCode)
        beaconUUID = try container.decodeNormalizedUUIDStringIfPresent(forKey: .beaconUUID)
            ?? aliasContainer.decodeNormalizedUUIDStringIfPresent(forKey: .uuid)
            ?? identityParts.uuid
        beaconMajor = try container.decodeFlexibleIntIfPresent(forKey: .beaconMajor)
            ?? aliasContainer.decodeFlexibleIntIfPresent(forKey: .major)
            ?? identityParts.major
        beaconMinor = try container.decodeFlexibleIntIfPresent(forKey: .beaconMinor)
            ?? aliasContainer.decodeFlexibleIntIfPresent(forKey: .minor)
            ?? identityParts.minor
        x = try container.decode(Double.self, forKey: .x)
        y = try container.decode(Double.self, forKey: .y)
        width = try container.decodeIfPresent(Double.self, forKey: .width)
        height = try container.decodeIfPresent(Double.self, forKey: .height)
        color = try container.decodeIfPresent(String.self, forKey: .color)
        label = try container.decodeIfPresent(String.self, forKey: .label)
        category = try container.decodeIfPresent(String.self, forKey: .category)

        let decodedMeter = try container.decodeIfPresent(Int.self, forKey: .meter)
        meter = decodedMeter ?? Self.parseMeter(from: category)

        rotation = try container.decodeIfPresent(Double.self, forKey: .rotation)
        accessAngle = try container.decodeIfPresent(Double.self, forKey: .accessAngle)
        locked = try container.decodeIfPresent(Bool.self, forKey: .locked)
        anchorId = try container.decodeIfPresent(String.self, forKey: .anchorId)
    }

    private static func parseMeter(from category: String?) -> Int? {
        guard let category else { return nil }
        let parts = category.split(separator: "/")
        guard parts.count > 1 else { return nil }
        return Int(parts[1])
    }

    private static func parseIdentity(from identityKey: String?) -> (uuid: String?, major: Int?, minor: Int?) {
        guard let identityKey else {
            return (nil, nil, nil)
        }

        let parts = identityKey.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count >= 3 else {
            return (nil, nil, nil)
        }

        return (
            BeaconUUIDNormalizer.normalizedUUIDString(from: String(parts[0])),
            Int(parts[1]),
            Int(parts[2])
        )
    }
}

public struct LayoutVersionSummary: Codable, Identifiable, Hashable, Sendable {
    public let layoutId: String
    public let shopName: String
    public let savedAt: String?
    public let exportDate: String?
    public let elementCount: Int?

    private enum CodingKeys: String, CodingKey {
        case layoutId
        case shopName
        case savedAt
        case exportDate
        case elementCount
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        layoutId = try container.decodeFlexibleString(forKey: .layoutId)
        shopName = try container.decode(String.self, forKey: .shopName)
        savedAt = try container.decodeIfPresent(String.self, forKey: .savedAt)
        exportDate = try container.decodeIfPresent(String.self, forKey: .exportDate)
        elementCount = try container.decodeIfPresent(Int.self, forKey: .elementCount)
    }

    public var id: String {
        layoutId
    }

    public var displayName: String {
        if let timestamp = LayoutTimestampFormatter.display(savedAt ?? exportDate) {
            return "Version vom \(timestamp)"
        }
        return "Version \(layoutId.prefix(8))"
    }

    public var detailText: String {
        var parts: [String] = [shopName]
        if let elementCount {
            parts.append("\(elementCount) Elemente")
        }
        if let timestamp = LayoutTimestampFormatter.display(savedAt ?? exportDate) {
            parts.append(timestamp)
        }
        return parts.joined(separator: " • ")
    }
}

public enum LayoutSelectionMode: String, Sendable {
    case currentServer
    case version
}

public enum LayoutTimestampFormatter {
    private static let outputFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_AT")
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()

    nonisolated(unsafe) private static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    nonisolated(unsafe) private static let iso8601Standard: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    public static func display(_ rawValue: String?) -> String? {
        guard let rawValue else { return nil }

        if let date = iso8601WithFractionalSeconds.date(from: rawValue) ?? iso8601Standard.date(from: rawValue) {
            return outputFormatter.string(from: date)
        }

        return nil
    }
}

private extension KeyedDecodingContainer {
    func decodeFlexibleString(forKey key: Key) throws -> String {
        if let stringValue = try? decode(String.self, forKey: key) {
            return stringValue
        }
        if let intValue = try? decode(Int.self, forKey: key) {
            return String(intValue)
        }
        if let int64Value = try? decode(Int64.self, forKey: key) {
            return String(int64Value)
        }
        if let doubleValue = try? decode(Double.self, forKey: key) {
            if doubleValue.rounded(.towardZero) == doubleValue {
                return String(Int64(doubleValue))
            }
            return String(doubleValue)
        }
        throw DecodingError.typeMismatch(
            String.self,
            .init(codingPath: codingPath + [key], debugDescription: "Expected string-compatible value.")
        )
    }

    func decodeFlexibleStringIfPresent(forKey key: Key) throws -> String? {
        if !contains(key) {
            return nil
        }
        if try decodeNil(forKey: key) {
            return nil
        }
        return try decodeFlexibleString(forKey: key)
    }

    func decodeFlexibleIntIfPresent(forKey key: Key) throws -> Int? {
        if !contains(key) {
            return nil
        }
        if try decodeNil(forKey: key) {
            return nil
        }
        if let intValue = try? decode(Int.self, forKey: key) {
            return intValue
        }
        if let int64Value = try? decode(Int64.self, forKey: key) {
            return Int(clamping: int64Value)
        }
        if let doubleValue = try? decode(Double.self, forKey: key) {
            return Int(doubleValue)
        }
        if let stringValue = try? decode(String.self, forKey: key) {
            return Int(stringValue.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return nil
    }

    func decodeNormalizedUUIDStringIfPresent(forKey key: Key) throws -> String? {
        guard contains(key) else {
            return nil
        }

        guard let rawValue = try decodeIfPresent(String.self, forKey: key) else {
            return nil
        }

        return BeaconUUIDNormalizer.normalizedUUIDString(from: rawValue)
    }
}
