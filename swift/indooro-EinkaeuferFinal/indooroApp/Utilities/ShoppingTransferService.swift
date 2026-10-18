import IndooroModels
import Foundation
import UniformTypeIdentifiers

extension UTType {
    static let indooroShoppingList = UTType(exportedAs: "at.ac.htl.leonding.indooro.shopping-list", conformingTo: .json)
}

enum ShoppingTransferError: LocalizedError {
    case emptySelection
    case invalidFile
    case unsupportedVersion(Int)
    case noReadableData
    case failedToCreateExport

    var errorDescription: String? {
        switch self {
        case .emptySelection:
            return "Es wurden keine Artikel für den Transfer ausgewählt."
        case .invalidFile:
            return "Die ausgewählte Datei ist keine gültige Indooro-Einkaufsliste."
        case .unsupportedVersion(let version):
            return "Diese Listen-Datei verwendet eine nicht unterstützte Version (\(version))."
        case .noReadableData:
            return "Die Datei konnte nicht gelesen werden."
        case .failedToCreateExport:
            return "Die Export-Datei konnte nicht erstellt werden."
        }
    }
}

enum ShoppingTransferService {
    static let fileExtension = "indoorolist"

    static func makePackage(
        from list: ShoppingList,
        items: [ShoppingTransferItem],
        kind: ShoppingTransferKind,
        senderDisplayName: String? = nil,
        note: String? = nil
    ) throws -> ShoppingTransferPackage {
        let trimmedName = list.name.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !items.isEmpty else {
            throw ShoppingTransferError.emptySelection
        }

        return ShoppingTransferPackage(
            kind: kind,
            sourceListID: list.id,
            sourceListName: trimmedName.isEmpty ? "Einkaufsliste" : trimmedName,
            senderDisplayName: senderDisplayName,
            note: note,
            items: items
        )
    }

    static func writePackageToTemporaryFile(_ package: ShoppingTransferPackage) throws -> URL {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        let data = try encoder.encode(package)
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("ShoppingTransfers", isDirectory: true)
        try FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)

        let sanitizedName = sanitizeFileName(package.suggestedImportedListName)
        let fileName = "\(sanitizedName)-\(package.id.uuidString.prefix(8)).\(fileExtension)"
        let fileURL = tempDirectory.appendingPathComponent(fileName, isDirectory: false)

        do {
            try data.write(to: fileURL, options: .atomic)
            return fileURL
        } catch {
            throw ShoppingTransferError.failedToCreateExport
        }
    }

    static func loadPackage(from url: URL) throws -> ShoppingTransferPackage {
        let didAccessSecurityScope = url.startAccessingSecurityScopedResource()
        defer {
            if didAccessSecurityScope {
                url.stopAccessingSecurityScopedResource()
            }
        }

        guard let data = try? Data(contentsOf: url) else {
            throw ShoppingTransferError.noReadableData
        }

        return try decodePackage(from: data)
    }

    static func decodePackage(from data: Data) throws -> ShoppingTransferPackage {
        let decoder = JSONDecoder.indooro

        guard let package = try? decoder.decode(ShoppingTransferPackage.self, from: data) else {
            throw ShoppingTransferError.invalidFile
        }

        guard package.version == ShoppingTransferPackage.currentVersion else {
            throw ShoppingTransferError.unsupportedVersion(package.version)
        }

        guard !package.items.isEmpty else {
            throw ShoppingTransferError.emptySelection
        }

        return package
    }

    private static func sanitizeFileName(_ input: String) -> String {
        let invalidCharacters = CharacterSet(charactersIn: "/\\?%*|\"<>:")
        let cleaned = input
            .components(separatedBy: invalidCharacters)
            .joined(separator: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return cleaned.isEmpty ? "einkaufsliste" : cleaned.replacingOccurrences(of: " ", with: "-")
    }
}
