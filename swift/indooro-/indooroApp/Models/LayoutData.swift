import Foundation

struct LayoutData: Codable, Sendable {
    let shopName: String
    let gridSize: GridSize
    let elements: [LayoutElement]
    let exportDate: String?
    let layoutId: String?
    let savedAt: String?
    let recordType: String?

    private enum CodingKeys: String, CodingKey {
        case shopName
        case gridSize
        case elements
        case exportDate
        case layoutId
        case savedAt
        case recordType
    }

    init(from decoder: Decoder) throws {
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

struct GridSize: Codable, Sendable {
    let width: Double
    let height: Double
}

struct LayoutElement: Codable, Identifiable, Sendable {
    let id: Int64
    let type: String
    let beaconId: String?
    let beaconUUID: String?
    let beaconMajor: Int?
    let beaconMinor: Int?
    let x: Double
    let y: Double
    let width: Double?
    let height: Double?
    let color: String?
    let label: String?
    let category: String?
    let meter: Int?
    let rotation: Double?
    let accessAngle: Double?
    let locked: Bool?

    var isBeacon: Bool {
        type == "beacon"
    }

    var categoryBase: String? {
        guard let category else { return nil }
        return category.split(separator: "/").first.map(String.init)
    }

    var effectiveMeter: Int? {
        meter ?? Self.parseMeter(from: category)
    }

    var resolvedCategoryCode: String? {
        guard let categoryBase else { return nil }
        if let effectiveMeter {
            return "\(categoryBase)/\(effectiveMeter)"
        }
        return categoryBase
    }

    /// Match a product's complete category segment, not a numeric prefix such as 31 in 310.
    func matchesProductLayoutCode(_ layoutCode: String) -> Bool {
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
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(Int64.self, forKey: .id)
        type = try container.decode(String.self, forKey: .type)
        beaconId = try container.decodeIfPresent(String.self, forKey: .beaconId)
        beaconUUID = try container.decodeIfPresent(String.self, forKey: .beaconUUID)
        beaconMajor = try container.decodeIfPresent(Int.self, forKey: .beaconMajor)
        beaconMinor = try container.decodeIfPresent(Int.self, forKey: .beaconMinor)
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
    }

    private static func parseMeter(from category: String?) -> Int? {
        guard let category else { return nil }
        let parts = category.split(separator: "/")
        guard parts.count > 1 else { return nil }
        return Int(parts[1])
    }
}

struct LayoutVersionSummary: Codable, Identifiable, Hashable, Sendable {
    let layoutId: String
    let shopName: String
    let savedAt: String?
    let exportDate: String?
    let elementCount: Int?

    private enum CodingKeys: String, CodingKey {
        case layoutId
        case shopName
        case savedAt
        case exportDate
        case elementCount
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        layoutId = try container.decodeFlexibleString(forKey: .layoutId)
        shopName = try container.decode(String.self, forKey: .shopName)
        savedAt = try container.decodeIfPresent(String.self, forKey: .savedAt)
        exportDate = try container.decodeIfPresent(String.self, forKey: .exportDate)
        elementCount = try container.decodeIfPresent(Int.self, forKey: .elementCount)
    }

    var id: String {
        layoutId
    }

    var displayName: String {
        if let timestamp = LayoutTimestampFormatter.display(savedAt ?? exportDate) {
            return "Version vom \(timestamp)"
        }
        return "Version \(layoutId.prefix(8))"
    }

    var detailText: String {
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

enum LayoutSelectionMode: String, Sendable {
    case currentServer
    case version
}

enum LayoutTimestampFormatter {
    private static let outputFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_AT")
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()

    private static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let iso8601Standard: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func display(_ rawValue: String?) -> String? {
        guard let rawValue else { return nil }

        if let date = iso8601WithFractionalSeconds.date(from: rawValue) ?? iso8601Standard.date(from: rawValue) {
            return outputFormatter.string(from: date)
        }

        return nil
    }
}

private extension KeyedDecodingContainer {
    func decodeFlexibleString(forKey key: Key) throws -> String {
        if let stringValue = try decodeIfPresent(String.self, forKey: key) {
            return stringValue
        }
        if let intValue = try decodeIfPresent(Int.self, forKey: key) {
            return String(intValue)
        }
        if let int64Value = try decodeIfPresent(Int64.self, forKey: key) {
            return String(int64Value)
        }
        if let doubleValue = try decodeIfPresent(Double.self, forKey: key) {
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
        return try decodeFlexibleString(forKey: key)
    }
}
