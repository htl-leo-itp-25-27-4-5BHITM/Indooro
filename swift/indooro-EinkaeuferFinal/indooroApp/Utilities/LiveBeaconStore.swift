#if DEBUG
import Foundation

/// Sicht auf alle empfangenen iBeacons (auch ohne Layout-Treffer) fuer die Sichtpruefung vor Ort (nur DEBUG).
/// Wird von `BeaconManager` bei jedem Ranging- und Scan-Ergebnis gefuettert und von der Einstellungsansicht
/// im Sekundentakt gelesen; deshalb kein `@Published` (kein Neuzeichnen im Funktakt).
final class LiveBeaconStore: @unchecked Sendable {
    static let shared = LiveBeaconStore()

    struct Entry: Equatable, Identifiable {
        let uuid: String
        let major: Int
        let minor: Int
        var rssi: Int
        var lastSeen: Date
        var id: String { "\(uuid)-\(major)-\(minor)" }
    }

    /// Eintraege, die laenger nicht gesehen wurden, bleiben in der Liste (grau), bis die App endet oder `clear()` laeuft.
    private let lock = NSLock()
    private var entries: [String: Entry] = [:]

    func observe(uuid: String, major: Int, minor: Int, rssi: Int, at date: Date = Date()) {
        let entry = Entry(uuid: uuid, major: major, minor: minor, rssi: rssi, lastSeen: date)
        lock.lock()
        entries[entry.id] = entry
        lock.unlock()
    }

    func clear() {
        lock.lock()
        entries.removeAll()
        lock.unlock()
    }

    /// Sortiert nach RSSI (staerkster zuerst); ohne Messwert (`rssi >= 0`) ans Ende, dann nach Major/Minor.
    func snapshot() -> [Entry] {
        lock.lock()
        let values = Array(entries.values)
        lock.unlock()
        return Self.sorted(values)
    }

    static func sorted(_ values: [Entry]) -> [Entry] {
        values.sorted { left, right in
            let leftValid = left.rssi < 0
            let rightValid = right.rssi < 0
            if leftValid != rightValid { return leftValid }
            if left.rssi != right.rssi { return left.rssi > right.rssi }
            if left.major != right.major { return left.major < right.major }
            return left.minor < right.minor
        }
    }
}
#endif
