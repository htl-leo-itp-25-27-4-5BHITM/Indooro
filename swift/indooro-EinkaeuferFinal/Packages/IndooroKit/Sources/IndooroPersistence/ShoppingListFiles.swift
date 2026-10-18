import Foundation
import IndooroModels

/// Dateien des Repositorys: `lists.json`, `lists.json.tmp`, `lists.json.bak`, `lists.corrupt-<timestamp>.json`.
struct ShoppingListPaths: Sendable {
    let directory: URL

    var primary: URL { directory.appendingPathComponent("lists.json", isDirectory: false) }
    var temporary: URL { directory.appendingPathComponent("lists.json.tmp", isDirectory: false) }
    var backup: URL { directory.appendingPathComponent("lists.json.bak", isDirectory: false) }
    var temporaryBackup: URL { directory.appendingPathComponent("lists.json.bak.tmp", isDirectory: false) }
}

enum ShoppingListFileRead {
    case missing
    case valid(ShoppingListSnapshot)
    case invalid
}

/// Reine Dateioperationen (synchron, ohne Zustand). Das Repository ruft sie beim Start und beim Schreiben auf.
enum ShoppingListFiles {
    static func read(_ url: URL, fileManager: FileManager = .default) -> ShoppingListFileRead {
        guard fileManager.fileExists(atPath: url.path) else {
            return .missing
        }
        guard let data = try? Data(contentsOf: url),
              let snapshot = decode(data) else {
            return .invalid
        }
        return .valid(snapshot)
    }

    /// Nur Schema v2 ist lesbar; eine andere Version gilt als nicht lesbar und bleibt als `.corrupt` erhalten.
    static func decode(_ data: Data) -> ShoppingListSnapshot? {
        guard let snapshot = try? JSONDecoder().decode(ShoppingListSnapshot.self, from: data),
              snapshot.schemaVersion == ShoppingListSnapshot.currentSchemaVersion else {
            return nil
        }
        return snapshot
    }

    static func encode(_ snapshot: ShoppingListSnapshot) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(snapshot)
    }

    /// Schreibt den Zustand: kodieren, `lists.json.tmp` schreiben, pruefen, die bisherige gueltige Datei als
    /// `lists.json.bak` sichern und `lists.json` per Ersetzen austauschen. Schlaegt ein Schritt vor dem Ersetzen
    /// fehl, bleibt `lists.json` unveraendert; die temporaere Datei wird entfernt.
    static func write(
        _ snapshot: ShoppingListSnapshot,
        to paths: ShoppingListPaths,
        writer: (Data, URL) throws -> Void,
        now: Date,
        fileManager: FileManager = .default
    ) throws {
        let data = try encode(snapshot)
        try fileManager.createDirectory(at: paths.directory, withIntermediateDirectories: true)

        try? fileManager.removeItem(at: paths.temporary)
        do {
            try writer(data, paths.temporary)
            // Nie eine Datei einsetzen, die sich nicht wieder lesen laesst.
            guard let written = try? Data(contentsOf: paths.temporary), decode(written) != nil else {
                throw CocoaError(.fileWriteUnknown)
            }
        } catch {
            try? fileManager.removeItem(at: paths.temporary)
            throw error
        }

        do {
            if fileManager.fileExists(atPath: paths.primary.path) {
                switch read(paths.primary, fileManager: fileManager) {
                case .valid:
                    rotateBackup(paths, fileManager: fileManager)
                case .invalid:
                    // Unlesbare Datei nie ueberschreiben: erst beiseite legen, das alte Backup bleibt.
                    _ = quarantine(paths.primary, in: paths.directory, now: now, fileManager: fileManager)
                case .missing:
                    break
                }
            }

            if fileManager.fileExists(atPath: paths.primary.path) {
                _ = try fileManager.replaceItemAt(paths.primary, withItemAt: paths.temporary)
            } else {
                try fileManager.moveItem(at: paths.temporary, to: paths.primary)
            }
        } catch {
            try? fileManager.removeItem(at: paths.temporary)
            throw error
        }
    }

    /// Kopiert die gueltige `lists.json` nach `lists.json.bak`. Ein Fehler hier verhindert das Speichern nicht.
    private static func rotateBackup(_ paths: ShoppingListPaths, fileManager: FileManager) {
        do {
            try? fileManager.removeItem(at: paths.temporaryBackup)
            try fileManager.copyItem(at: paths.primary, to: paths.temporaryBackup)
            if fileManager.fileExists(atPath: paths.backup.path) {
                _ = try fileManager.replaceItemAt(paths.backup, withItemAt: paths.temporaryBackup)
            } else {
                try fileManager.moveItem(at: paths.temporaryBackup, to: paths.backup)
            }
        } catch {
            try? fileManager.removeItem(at: paths.temporaryBackup)
            PersistenceLog.logger.error("ShoppingLists: Backup fehlgeschlagen: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Benennt eine unlesbare Datei in `lists.corrupt-<timestamp>.json` um. Liefert den neuen Dateinamen.
    @discardableResult
    static func quarantine(_ url: URL, in directory: URL, now: Date, fileManager: FileManager = .default) -> String? {
        let name = uniqueCorruptName(in: directory, now: now, fileManager: fileManager)
        do {
            try fileManager.moveItem(at: url, to: directory.appendingPathComponent(name))
            return name
        } catch {
            PersistenceLog.logger.error("ShoppingLists: Quarantaene fehlgeschlagen: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    /// Rohdaten (z. B. ein nicht lesbarer `UserDefaults`-Blob) als `lists.corrupt-<timestamp>.json` sichern.
    static func preserve(_ data: Data, in directory: URL, now: Date, fileManager: FileManager = .default) -> String? {
        let name = uniqueCorruptName(in: directory, now: now, fileManager: fileManager)
        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: directory.appendingPathComponent(name), options: .atomic)
            return name
        } catch {
            PersistenceLog.logger.error("ShoppingLists: Sicherung des alten Blobs fehlgeschlagen: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private static func uniqueCorruptName(in directory: URL, now: Date, fileManager: FileManager) -> String {
        let stamp = timestamp(now)
        var name = "lists.corrupt-\(stamp).json"
        var counter = 1
        while fileManager.fileExists(atPath: directory.appendingPathComponent(name).path) {
            name = "lists.corrupt-\(stamp)-\(counter).json"
            counter += 1
        }
        return name
    }

    /// ISO-8601 ohne Trennzeichen, z. B. `20261018T154530Z` (dateinamentauglich).
    static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: ":", with: "")
    }
}
