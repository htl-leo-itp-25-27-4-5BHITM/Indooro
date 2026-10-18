import Foundation
import CoreGraphics

private func cleanRecipeIngredientName(
    _ ingredientName: String?,
    quantity: String?,
    unit: String?
) -> String? {
    guard let ingredientName else {
        return nil
    }

    let trimmedName = ingredientName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedName.isEmpty else {
        return nil
    }

    let amountCandidates = [
        [quantity, unit]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " "),
        quantity?.trimmingCharacters(in: .whitespacesAndNewlines)
    ]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        .sorted { $0.count > $1.count }

    for amount in amountCandidates {
        let prefix = "\(amount) "
        if trimmedName.range(of: prefix, options: [.anchored, .caseInsensitive]) != nil {
            let start = trimmedName.index(trimmedName.startIndex, offsetBy: prefix.count)
            let cleaned = trimmedName[start...].trimmingCharacters(in: .whitespacesAndNewlines)
            if !cleaned.isEmpty {
                return cleaned
            }
        }
    }

    return trimmedName
}

public enum ShoppingListItemStatus: String, Codable, CaseIterable, Hashable, Sendable {
    case open
    case done
    case missing
    case skipped

    public var isRoutable: Bool {
        self == .open
    }

    public var isCompleted: Bool {
        self == .done || self == .missing || self == .skipped
    }

    public var badgeTitle: String {
        switch self {
        case .open:
            return "Offen"
        case .done:
            return "Erledigt"
        case .missing:
            return "Nicht gefunden"
        case .skipped:
            return "Übersprungen"
        }
    }
}

public enum ShoppingRouteMode: String, Codable, CaseIterable, Sendable {
    case optimized
    case listOrder

    public var title: String {
        switch self {
        case .optimized:
            return "Optimiert"
        case .listOrder:
            return "Listenreihenfolge"
        }
    }
}

public struct ShoppingListItem: Codable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public let productID: Int?
    public var name: String
    public var price: Double?
    public var layoutCode: String?
    public var quantity: Int
    public var note: String?
    public var sortOrder: Int?
    public var status: ShoppingListItemStatus
    public let addedAt: Date
    public var updatedAt: Date
    public var sourceRecipeId: UUID?
    public var sourceRecipeName: String?
    public var ingredientName: String?
    public var ingredientQuantity: String?
    public var ingredientUnit: String?
    public var mappingConfidence: Double?
    public var manuallyConfirmed: Bool?
    public var addedFromUpsell: Bool

    public init(
        product: Product,
        quantity: Int = 1,
        note: String? = nil,
        sortOrder: Int? = nil,
        sourceRecipeId: UUID? = nil,
        sourceRecipeName: String? = nil,
        ingredientName: String? = nil,
        ingredientQuantity: String? = nil,
        ingredientUnit: String? = nil,
        mappingConfidence: Double? = nil,
        manuallyConfirmed: Bool? = nil,
        addedFromUpsell: Bool = false
    ) {
        self.id = UUID()
        self.productID = product.id
        self.name = product.name
        self.price = product.price
        self.layoutCode = product.layoutCode
        self.quantity = max(1, quantity)
        self.note = note
        self.sortOrder = sortOrder
        self.status = .open
        self.addedAt = Date()
        self.updatedAt = Date()
        self.sourceRecipeId = sourceRecipeId
        self.sourceRecipeName = sourceRecipeName
        self.ingredientName = ingredientName
        self.ingredientQuantity = ingredientQuantity
        self.ingredientUnit = ingredientUnit
        self.mappingConfidence = mappingConfidence
        self.manuallyConfirmed = manuallyConfirmed
        self.addedFromUpsell = addedFromUpsell
    }

    public init(
        freeIngredientName: String,
        quantity: Int = 1,
        note: String? = nil,
        sortOrder: Int? = nil,
        sourceRecipeId: UUID?,
        sourceRecipeName: String?,
        ingredientQuantity: String?,
        ingredientUnit: String?
    ) {
        self.id = UUID()
        self.productID = nil
        self.name = freeIngredientName
        self.price = nil
        self.layoutCode = nil
        self.quantity = max(1, quantity)
        self.note = note
        self.sortOrder = sortOrder
        self.status = .open
        self.addedAt = Date()
        self.updatedAt = Date()
        self.sourceRecipeId = sourceRecipeId
        self.sourceRecipeName = sourceRecipeName
        self.ingredientName = freeIngredientName
        self.ingredientQuantity = ingredientQuantity
        self.ingredientUnit = ingredientUnit
        self.mappingConfidence = nil
        self.manuallyConfirmed = false
        self.addedFromUpsell = false
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case productID
        case name
        case price
        case layoutCode
        case quantity
        case note
        case sortOrder
        case status
        case addedAt
        case updatedAt
        case sourceRecipeId
        case sourceRecipeName
        case ingredientName
        case ingredientQuantity
        case ingredientUnit
        case mappingConfidence
        case manuallyConfirmed
        case addedFromUpsell
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        productID = try container.decodeIfPresent(Int.self, forKey: .productID)
        name = try container.decode(String.self, forKey: .name)
        price = try container.decodeIfPresent(Double.self, forKey: .price)
        layoutCode = try container.decodeIfPresent(String.self, forKey: .layoutCode)
        quantity = try container.decode(Int.self, forKey: .quantity)
        note = try container.decodeIfPresent(String.self, forKey: .note)
        sortOrder = try container.decodeIfPresent(Int.self, forKey: .sortOrder)
        status = try container.decode(ShoppingListItemStatus.self, forKey: .status)
        addedAt = try container.decode(Date.self, forKey: .addedAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        sourceRecipeId = try container.decodeIfPresent(UUID.self, forKey: .sourceRecipeId)
        sourceRecipeName = try container.decodeIfPresent(String.self, forKey: .sourceRecipeName)
        ingredientName = try container.decodeIfPresent(String.self, forKey: .ingredientName)
        ingredientQuantity = try container.decodeIfPresent(String.self, forKey: .ingredientQuantity)
        ingredientUnit = try container.decodeIfPresent(String.self, forKey: .ingredientUnit)
        mappingConfidence = try container.decodeIfPresent(Double.self, forKey: .mappingConfidence)
        manuallyConfirmed = try container.decodeIfPresent(Bool.self, forKey: .manuallyConfirmed)
        addedFromUpsell = try container.decodeIfPresent(Bool.self, forKey: .addedFromUpsell) ?? false
    }

    public var effectiveSortOrder: Int {
        sortOrder ?? Int(addedAt.timeIntervalSince1970 * 1000)
    }

    public var trimmedNote: String? {
        guard let note else {
            return nil
        }

        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    public var recipeSourceText: String? {
        guard let sourceRecipeName, !sourceRecipeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }

        let ingredient = cleanRecipeIngredientName(
            ingredientName,
            quantity: ingredientQuantity,
            unit: ingredientUnit
        )
        let amount = [ingredientQuantity, ingredientUnit]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")

        if let ingredient, !ingredient.isEmpty, !amount.isEmpty {
            return "\(sourceRecipeName): \(amount) \(ingredient)"
        }
        if let ingredient, !ingredient.isEmpty {
            return "\(sourceRecipeName): \(ingredient)"
        }
        return sourceRecipeName
    }

    public static func sortByListOrder(_ lhs: ShoppingListItem, _ rhs: ShoppingListItem) -> Bool {
        if lhs.effectiveSortOrder == rhs.effectiveSortOrder {
            if lhs.addedAt == rhs.addedAt {
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
            return lhs.addedAt < rhs.addedAt
        }

        return lhs.effectiveSortOrder < rhs.effectiveSortOrder
    }
}

public struct ShoppingList: Codable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public var name: String
    public var items: [ShoppingListItem]
    public let createdAt: Date
    public var updatedAt: Date
    public var isArchived: Bool

    public init(id: UUID = UUID(), name: String) {
        self.id = id
        self.name = name
        self.items = []
        self.createdAt = Date()
        self.updatedAt = Date()
        self.isArchived = false
    }

    public var openItemCount: Int {
        items.filter { $0.status == .open }.reduce(0) { $0 + $1.quantity }
    }

    public var completedItemCount: Int {
        items.filter { $0.status.isCompleted }.reduce(0) { $0 + $1.quantity }
    }
}

public struct ShoppingStop: Identifiable, Hashable, Sendable {
    public let id: String
    public let shelfID: Int64?
    public let title: String
    public let mapPoint: CGPoint
    public let items: [ShoppingListItem]
    public let orderSeed: Int

    public var itemIDs: [UUID] {
        items.map(\.id)
    }

    public var totalQuantity: Int {
        items.reduce(0) { $0 + $1.quantity }
    }

    public var subtitle: String {
        let articleWord = totalQuantity == 1 ? "Artikel" : "Artikel"
        return "\(totalQuantity) \(articleWord)"
    }

    public var itemNamesPreview: String {
        let names = items
            .map(\.name)
            .prefix(2)
            .joined(separator: ", ")
        if items.count > 2 {
            return "\(names) +\(items.count - 2)"
        }
        return names
    }

    public init(id: String, shelfID: Int64?, title: String, mapPoint: CGPoint, items: [ShoppingListItem], orderSeed: Int) {
        self.id = id
        self.shelfID = shelfID
        self.title = title
        self.mapPoint = mapPoint
        self.items = items
        self.orderSeed = orderSeed
    }
}

public struct ShoppingRouteSnapshot: Sendable {
    public let listID: UUID
    public let listName: String
    public let routeMode: ShoppingRouteMode
    public let orderedStops: [ShoppingStop]
    public let unresolvedItems: [ShoppingListItem]
    public let completedItems: [ShoppingListItem]
    public let totalStopCount: Int
    public let totalProductCount: Int

    public var currentStop: ShoppingStop? {
        orderedStops.first
    }

    public var remainingStopCount: Int {
        orderedStops.count
    }

    public var remainingProductCount: Int {
        orderedStops.reduce(0) { $0 + $1.totalQuantity } + unresolvedItems.reduce(0) { $0 + $1.quantity }
    }

    public var unresolvedProductCount: Int {
        unresolvedItems.reduce(0) { $0 + $1.quantity }
    }

    public var completedProductCount: Int {
        completedItems.reduce(0) { $0 + $1.quantity }
    }

    public var completedStopCount: Int {
        max(0, totalStopCount - remainingStopCount)
    }

    public var currentStopNumber: Int? {
        guard currentStop != nil, totalStopCount > 0 else {
            return nil
        }

        return min(totalStopCount, completedStopCount + 1)
    }

    public var progressFraction: Double {
        guard totalProductCount > 0 else {
            return remainingStopCount == 0 ? 1 : 0
        }

        return min(1, max(0, Double(completedProductCount) / Double(totalProductCount)))
    }

    public init(listID: UUID, listName: String, routeMode: ShoppingRouteMode, orderedStops: [ShoppingStop], unresolvedItems: [ShoppingListItem], completedItems: [ShoppingListItem], totalStopCount: Int, totalProductCount: Int) {
        self.listID = listID
        self.listName = listName
        self.routeMode = routeMode
        self.orderedStops = orderedStops
        self.unresolvedItems = unresolvedItems
        self.completedItems = completedItems
        self.totalStopCount = totalStopCount
        self.totalProductCount = totalProductCount
    }
}

public struct ShoppingSessionBanner: Sendable {
    public let listName: String
    public let currentStopTitle: String
    public let remainingStopCount: Int
    public let remainingProductCount: Int
    public let unresolvedProductCount: Int

    public init(listName: String, currentStopTitle: String, remainingStopCount: Int, remainingProductCount: Int, unresolvedProductCount: Int) {
        self.listName = listName
        self.currentStopTitle = currentStopTitle
        self.remainingStopCount = remainingStopCount
        self.remainingProductCount = remainingProductCount
        self.unresolvedProductCount = unresolvedProductCount
    }
}
