import Foundation
import os

/// Datei-Cache fuer die rohen Layout-Antworten des Servers (Offline-Start).
///
/// Dateien liegen im Verzeichnis `directory` als `<storeId>.json` bzw. `default.json`
/// (Default-Layout ohne Store). Gespeichert werden exakt die Server-Antwortdaten, die
/// `decodeMobileLayout` / `decodeLayout` verarbeiten. Das Aenderungsdatum der Datei gilt als
/// Zeitpunkt der Speicherung. Fehler werden protokolliert, nie geworfen.
public struct LayoutCacheStore: Sendable {
    public static let defaultFileName = "default"

    /// Verzeichnis, in dem die Cache-Dateien liegen. `nil` nur, wenn kein Application-Support-Verzeichnis
    /// ermittelt werden kann; dann sind Speichern und Laden wirkungslos.
    private let directory: URL?

    /// - Parameter directory: Cache-Verzeichnis selbst. Standard: `<Application Support>/LayoutCache`.
    public init(directory: URL? = nil) {
        self.directory = directory ?? Self.defaultDirectory()
    }

    /// Speichert die Rohdaten atomar. `storeID == nil` schreibt `default.json`.
    public func save(_ data: Data, storeID: String?) {
        guard let url = fileURL(storeID: storeID) else { return }

        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: url, options: .atomic)

            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var excludedURL = url
            try excludedURL.setResourceValues(values)
        } catch {
            PersistenceLog.logger.error("LayoutCache: Speichern fehlgeschlagen (\(url.lastPathComponent, privacy: .private(mask: .hash))): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Liefert die gespeicherten Rohdaten und deren Speicherzeitpunkt, sonst `nil`.
    public func load(storeID: String?) -> (data: Data, savedAt: Date)? {
        guard let url = fileURL(storeID: storeID),
              FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }

        do {
            let data = try Data(contentsOf: url)
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            guard let savedAt = attributes[.modificationDate] as? Date else {
                return nil
            }
            return (data, savedAt)
        } catch {
            PersistenceLog.logger.error("LayoutCache: Laden fehlgeschlagen (\(url.lastPathComponent, privacy: .private(mask: .hash))): \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    /// Store-IDs bestehen nur aus Buchstaben, Ziffern und `-` (UUID-Zeichen). `default` ist reserviert,
    /// damit die Store-Datei nie mit `default.json` kollidiert (auch nicht auf case-insensitiven Dateisystemen).
    public static func isValidStoreID(_ storeID: String) -> Bool {
        guard !storeID.isEmpty, storeID.lowercased() != defaultFileName else {
            return false
        }
        return storeID.allSatisfy { allowedStoreIDCharacters.contains($0) }
    }

    private static let allowedStoreIDCharacters = Set(
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"
    )

    private static func defaultDirectory() -> URL? {
        guard let supportDirectory = try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) else {
            return nil
        }
        return supportDirectory.appendingPathComponent("LayoutCache", isDirectory: true)
    }

    private func fileURL(storeID: String?) -> URL? {
        guard let directory else { return nil }

        let name: String
        if let storeID {
            guard Self.isValidStoreID(storeID) else {
                PersistenceLog.logger.error("LayoutCache: Ungültige Store-ID abgelehnt")
                return nil
            }
            name = storeID
        } else {
            name = Self.defaultFileName
        }

        return directory.appendingPathComponent("\(name).json", isDirectory: false)
    }
}
