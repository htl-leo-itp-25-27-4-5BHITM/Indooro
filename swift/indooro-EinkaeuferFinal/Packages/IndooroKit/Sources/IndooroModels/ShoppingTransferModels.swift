import Foundation

public enum ShoppingTransferKind: String, Codable, CaseIterable, Sendable {
    case fullList
    case itemSelection

    public var title: String {
        switch self {
        case .fullList:
            return "Komplette Liste"
        case .itemSelection:
            return "Artikelauswahl"
        }
    }
}

public struct ShoppingTransferItem: Codable, Hashable, Sendable {
    public let productID: Int
    public let name: String
    public let price: Double
    public let layoutCode: String
    public let quantity: Int
    public let note: String?
    public let status: ShoppingListItemStatus

    public init?(item: ShoppingListItem, quantity: Int? = nil) {
        guard let productID = item.productID,
              let price = item.price,
              let layoutCode = item.layoutCode else {
            return nil
        }
        let availableQuantity = max(1, item.quantity)
        self.productID = productID
        self.name = item.name
        self.price = price
        self.layoutCode = layoutCode
        self.quantity = min(availableQuantity, max(1, quantity ?? availableQuantity))
        self.note = item.trimmedNote
        self.status = item.status
    }
}

public struct ShoppingShareSelection: Identifiable, Hashable, Sendable {
    public let itemID: UUID
    public var quantity: Int

    public var id: UUID {
        itemID
    }

    public init(itemID: UUID, quantity: Int) {
        self.itemID = itemID
        self.quantity = quantity
    }
}

public struct ShoppingTransferPackage: Codable, Identifiable, Sendable {
    public static let currentVersion = 1

    public let id: UUID
    public let version: Int
    public let kind: ShoppingTransferKind
    public let sourceListID: UUID?
    public let sourceListName: String
    public let senderDisplayName: String?
    public let note: String?
    public let exportedAt: Date
    public let items: [ShoppingTransferItem]

    public init(
        id: UUID = UUID(),
        version: Int = ShoppingTransferPackage.currentVersion,
        kind: ShoppingTransferKind,
        sourceListID: UUID?,
        sourceListName: String,
        senderDisplayName: String? = nil,
        note: String? = nil,
        exportedAt: Date = Date(),
        items: [ShoppingTransferItem]
    ) {
        self.id = id
        self.version = version
        self.kind = kind
        self.sourceListID = sourceListID
        self.sourceListName = sourceListName
        self.senderDisplayName = senderDisplayName
        self.note = note
        self.exportedAt = exportedAt
        self.items = items
    }

    public var totalQuantity: Int {
        items.reduce(0) { $0 + $1.quantity }
    }

    public var suggestedImportedListName: String {
        sourceListName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "Importierte Einkaufsliste"
            : sourceListName
    }
}

extension ShoppingListItem {
    public init(transferItem: ShoppingTransferItem, sortOrder: Int? = nil) {
        self.id = UUID()
        self.productID = transferItem.productID
        self.name = transferItem.name
        self.price = transferItem.price
        self.layoutCode = transferItem.layoutCode
        self.quantity = max(1, transferItem.quantity)
        let trimmedNote = transferItem.note?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.note = trimmedNote?.isEmpty == false ? trimmedNote : nil
        self.sortOrder = sortOrder
        self.status = transferItem.status
        self.addedAt = Date()
        self.updatedAt = Date()
        self.addedFromUpsell = false
    }
}
