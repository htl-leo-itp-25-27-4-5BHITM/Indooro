import Foundation

public enum BeaconUUIDNormalizer {
    public static func normalizedUUIDString(from rawValue: String) -> String? {
        let hexCharacterSet = CharacterSet(charactersIn: "0123456789abcdefABCDEF")
        let trimmed = rawValue
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "{}"))

        guard !trimmed.isEmpty else {
            return nil
        }

        if let parsed = UUID(uuidString: trimmed) {
            return parsed.uuidString.lowercased()
        }

        let hexOnly = trimmed.replacingOccurrences(of: "-", with: "")
        guard hexOnly.count == 32,
              hexOnly.unicodeScalars.allSatisfy({ hexCharacterSet.contains($0) }) else {
            return nil
        }

        let part1 = String(hexOnly.prefix(8))
        let part2 = String(hexOnly.dropFirst(8).prefix(4))
        let part3 = String(hexOnly.dropFirst(12).prefix(4))
        let part4 = String(hexOnly.dropFirst(16).prefix(4))
        let part5 = String(hexOnly.dropFirst(20).prefix(12))
        let normalized = [part1, part2, part3, part4, part5].joined(separator: "-")

        guard let parsed = UUID(uuidString: normalized) else {
            return nil
        }

        return parsed.uuidString.lowercased()
    }

    public static func uuid(from rawValue: String?) -> UUID? {
        guard let rawValue,
              let normalized = normalizedUUIDString(from: rawValue) else {
            return nil
        }
        return UUID(uuidString: normalized)
    }
}
