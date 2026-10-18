import IndooroModels
import Foundation
import Combine
import CoreGraphics
import simd
import IndooroNavigation
import IndooroPersistence

private struct ResolvedShoppingShelf {
    let id: Int64
    let title: String
    let mapPoint: CGPoint
}

private func normalizedShoppingNote(_ rawNote: String?) -> String? {
    guard let rawNote else {
        return nil
    }

    let trimmed = rawNote.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}

private func mergedShoppingNote(existing: String?, incoming: String?) -> String? {
    let existingNote = normalizedShoppingNote(existing)
    let incomingNote = normalizedShoppingNote(incoming)

    switch (existingNote, incomingNote) {
    case (nil, nil):
        return nil
    case let (existing?, nil):
        return existing
    case let (nil, incoming?):
        return incoming
    case let (existing?, incoming?):
        if existing.caseInsensitiveCompare(incoming) == .orderedSame {
            return existing
        }
        if existing.localizedCaseInsensitiveContains(incoming) {
            return existing
        }
        if incoming.localizedCaseInsensitiveContains(existing) {
            return incoming
        }
        return "\(existing)\n\(incoming)"
    }
}

private func mergedSourceText(existing: String?, incoming: String?) -> String? {
    let existingText = normalizedShoppingNote(existing)
    let incomingText = normalizedShoppingNote(incoming)

    switch (existingText, incomingText) {
    case (nil, nil):
        return nil
    case let (existing?, nil):
        return existing
    case let (nil, incoming?):
        return incoming
    case let (existing?, incoming?):
        if existing.localizedCaseInsensitiveContains(incoming) {
            return existing
        }
        if incoming.localizedCaseInsensitiveContains(existing) {
            return incoming
        }
        return "\(existing), \(incoming)"
    }
}

private func normalizedIngredientName(_ value: String) -> String {
    value
        .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
}

private func recipeIngredientNote(ingredient: RecipeIngredient, recipeName: String) -> String {
    let amount = [ingredient.quantityTextForList, ingredient.displayUnitForList]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .joined(separator: " ")
    let amountPrefix = amount.isEmpty ? "" : "\(amount) "
    return "Aus \(recipeName): \(amountPrefix)\(ingredient.cleanDisplayName)"
}

private func movedItems<T>(_ items: [T], fromOffsets: IndexSet, toOffset: Int) -> [T] {
    var reordered = items
    let movingItems = fromOffsets.map { reordered[$0] }
    let removedBeforeInsertion = fromOffsets.filter { $0 < toOffset }.count

    for offset in fromOffsets.sorted(by: >) {
        reordered.remove(at: offset)
    }

    let adjustedOffset = toOffset - removedBeforeInsertion
    let insertionIndex = min(max(0, adjustedOffset), reordered.count)
    reordered.insert(contentsOf: movingItems, at: insertionIndex)
    return reordered
}

/// Aufgeloeste Liste: Stopps (ungeordnet, in Listenreihenfolge), unaufloesbare und erledigte Artikel.
struct ResolvedShoppingList {
    let listID: UUID
    let listName: String
    let stops: [ShoppingStop]
    let unresolvedItems: [ShoppingListItem]
    let completedItems: [ShoppingListItem]
    let totalStopCount: Int
    let totalProductCount: Int
}

extension ShoppingRouteMode {
    var planningMode: TourPlanningMode {
        self == .optimized ? .optimized : .listOrder
    }
}

extension ShoppingStop {
    var planStop: TourPlanStop {
        TourPlanStop(id: id, title: title, mapPoint: SIMD2<Float>(mapPoint), orderSeed: orderSeed)
    }
}

enum ShoppingStopResolver {
    /// Loest die offenen Artikel zu Stopps auf, ohne zu ordnen oder zu planen.
    static func resolve(for list: ShoppingList, layoutElements: [LayoutElement]) -> ResolvedShoppingList {
        let completedItems = list.items
            .filter { $0.status.isCompleted }
            .sorted { $0.updatedAt > $1.updatedAt }

        let openItems = list.items
            .filter { $0.status == .open }
            .sorted(by: ShoppingListItem.sortByListOrder)

        var grouped: [String: (shelf: ResolvedShoppingShelf, items: [ShoppingListItem])] = [:]
        var unresolvedItems: [ShoppingListItem] = []

        for item in openItems {
            guard let layoutCode = item.layoutCode,
                  let shelf = resolveShelf(for: layoutCode, elements: layoutElements) else {
                unresolvedItems.append(item)
                continue
            }

            let key = "shelf-\(shelf.id)"
            if grouped[key] == nil {
                grouped[key] = (shelf, [])
            }
            grouped[key]?.items.append(item)
        }

        let stops = grouped.values.map { bucket in
            ShoppingStop(
                id: "shelf-\(bucket.shelf.id)",
                shelfID: bucket.shelf.id,
                title: bucket.shelf.title,
                mapPoint: bucket.shelf.mapPoint,
                items: bucket.items.sorted(by: ShoppingListItem.sortByListOrder),
                orderSeed: bucket.items.map(\.effectiveSortOrder).min() ?? 0
            )
        }

        let totalStopCount = Set<Int64>(
            list.items.compactMap { item in
                guard let layoutCode = item.layoutCode else {
                    return nil
                }
                return resolveShelf(for: layoutCode, elements: layoutElements)?.id
            }
        ).count

        return ResolvedShoppingList(
            listID: list.id,
            listName: list.name,
            stops: listOrdered(stops),
            unresolvedItems: unresolvedItems,
            completedItems: completedItems,
            totalStopCount: totalStopCount,
            totalProductCount: list.items.reduce(0) { $0 + $1.quantity }
        )
    }

    /// Stopps in Listenreihenfolge (orderSeed, Titel).
    static func listOrdered(_ stops: [ShoppingStop]) -> [ShoppingStop] {
        let byID = Dictionary(stops.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return TourPlanner.listOrder(stops.map(\.planStop)).compactMap { byID[$0.id] }
    }

    /// Planungsstart: projizierte Position, sonst Mitte des Eingangs, sonst `nil` (Listenreihenfolge).
    static func planningStart(position: CGPoint?, layoutElements: [LayoutElement]) -> SIMD2<Float>? {
        if let position {
            return SIMD2<Float>(position)
        }
        return entrancePoint(in: layoutElements)
    }

    static func entrancePoint(in layoutElements: [LayoutElement]) -> SIMD2<Float>? {
        guard let entrance = layoutElements.first(where: { $0.type == "entrance" }) else {
            return nil
        }
        return SIMD2<Float>(
            Float(entrance.x + (entrance.width ?? 1) / 2),
            Float(entrance.y + (entrance.height ?? 1) / 2)
        )
    }

    /// Ordnet Stopps mit dem `TourPlanner` (nur bei Planungsereignissen aufrufen).
    static func orderedStops(
        _ stops: [ShoppingStop],
        start: SIMD2<Float>?,
        graph: IndoorGraph?,
        mode: ShoppingRouteMode
    ) -> [ShoppingStop] {
        let byID = Dictionary(stops.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let ordered = TourPlanner.order(
            stops: stops.map(\.planStop),
            start: start,
            graph: graph,
            mode: mode.planningMode
        )
        return ordered.compactMap { byID[$0.id] }
    }

    static func makeSnapshot(
        from resolved: ResolvedShoppingList,
        routeMode: ShoppingRouteMode,
        orderedStops: [ShoppingStop]
    ) -> ShoppingRouteSnapshot {
        ShoppingRouteSnapshot(
            listID: resolved.listID,
            listName: resolved.listName,
            routeMode: routeMode,
            orderedStops: orderedStops,
            unresolvedItems: resolved.unresolvedItems,
            completedItems: resolved.completedItems,
            totalStopCount: resolved.totalStopCount,
            totalProductCount: resolved.totalProductCount
        )
    }

    /// Vorschau fuer Listen ohne Tour: plant einmal ab Start (projizierte Position, sonst Eingang).
    static func makeSnapshot(
        for list: ShoppingList,
        routeMode: ShoppingRouteMode,
        userPosition: CGPoint?,
        graph: IndoorGraph?,
        layoutElements: [LayoutElement]
    ) -> ShoppingRouteSnapshot {
        let resolved = resolve(for: list, layoutElements: layoutElements)
        let ordered = orderedStops(
            resolved.stops,
            start: planningStart(position: userPosition, layoutElements: layoutElements),
            graph: graph,
            mode: routeMode
        )
        return makeSnapshot(from: resolved, routeMode: routeMode, orderedStops: ordered)
    }

    private static func resolveShelf(
        for layoutCode: String,
        elements: [LayoutElement]
    ) -> ResolvedShoppingShelf? {
        let shelf = elements.first { $0.type != "beacon" && $0.matchesProductLayoutCode(layoutCode) }

        guard let shelf else {
            return nil
        }

        let titleBase = shelf.label?.trimmingCharacters(in: .whitespacesAndNewlines)
        let title: String
        if let titleBase, !titleBase.isEmpty {
            title = titleBase
        } else if let categoryCode = shelf.resolvedCategoryCode {
            title = "Regal \(categoryCode)"
        } else if let category = shelf.categoryBase {
            title = "Regal \(category)"
        } else {
            title = "Regal"
        }

        return ResolvedShoppingShelf(
            id: shelf.id,
            title: title,
            mapPoint: CGPoint(
                x: shelf.x + (shelf.width ?? 1) / 2,
                y: shelf.y + (shelf.height ?? 1) / 2
            )
        )
    }
}

final class ShoppingListManager: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var lists: [ShoppingList] = []
    @Published private(set) var selectedListID: UUID?
    @Published private(set) var revision = 0

    private let repository: ShoppingListRepository
    private var persistGeneration = 0
    private var lastSend: Task<Void, Never>?

    /// Der Startzustand wird synchron aus dem Repository uebernommen (`initialSnapshot`), damit der erste
    /// Frame dieselben Listen zeigt wie zuvor. Aenderungen gehen entprellt in die Datei `lists.json`.
    init(repository: ShoppingListRepository = ShoppingPersistence.shared) {
        self.repository = repository
        load()
        ensureDefaultListExists()
    }

    /// Schreibt ausstehende Aenderungen sofort (App geht in den Hintergrund, Tests). Wartet zuerst, bis alle
    /// bisherigen Aenderungen beim Repository angekommen sind.
    @MainActor
    func flush() async {
        await lastSend?.value
        await repository.flush()
    }

    var selectedList: ShoppingList? {
        if let selectedListID,
           let selected = lists.first(where: { $0.id == selectedListID }) {
            return selected
        }
        return lists.first
    }

    func list(with id: UUID?) -> ShoppingList? {
        guard let id else {
            return selectedList
        }
        return lists.first(where: { $0.id == id })
    }

    func isSelectedList(_ listID: UUID) -> Bool {
        selectedList?.id == listID
    }

    func containsProduct(_ product: Product, in listID: UUID? = nil) -> Bool {
        guard let list = list(with: listID) else {
            return false
        }
        return list.items.contains {
            $0.productID == product.id && $0.layoutCode == product.layoutCode && $0.status == .open
        }
    }

    func createList(named rawName: String) {
        let trimmed = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return
        }

        let list = ShoppingList(name: trimmed)
        lists.insert(list, at: 0)
        selectedListID = list.id
        persist()
    }

    func renameList(_ id: UUID, to rawName: String) {
        let trimmed = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return
        }

        mutateList(id: id) { list in
            list.name = trimmed
            list.updatedAt = Date()
        }
    }

    func selectList(_ id: UUID) {
        guard lists.contains(where: { $0.id == id }) else {
            return
        }
        selectedListID = id
        persist()
    }

    func deleteList(_ id: UUID) {
        guard lists.count > 1 else {
            return
        }

        lists.removeAll { $0.id == id }
        if selectedListID == id {
            selectedListID = lists.first?.id
        }
        persist()
    }

    @discardableResult
    func addProduct(
        _ product: Product,
        to listID: UUID? = nil,
        addedFromUpsell: Bool = false
    ) -> ShoppingListItem? {
        let targetListID = resolvedTargetListID(preferred: listID)
        guard let targetListID else {
            return nil
        }

        var createdItem: ShoppingListItem?
        mutateList(id: targetListID) { list in
            if let existingIndex = list.items.firstIndex(where: {
                $0.productID == product.id && $0.layoutCode == product.layoutCode && $0.status == .open
            }) {
                list.items[existingIndex].quantity += 1
                list.items[existingIndex].updatedAt = Date()
                list.items[existingIndex].addedFromUpsell = list.items[existingIndex].addedFromUpsell || addedFromUpsell
                createdItem = list.items[existingIndex]
            } else {
                let item = ShoppingListItem(
                    product: product,
                    sortOrder: nextSortOrder(in: list.items),
                    addedFromUpsell: addedFromUpsell
                )
                list.items.append(item)
                createdItem = item
            }
            list.updatedAt = Date()
        }

        return createdItem
    }

    @discardableResult
    func addRecipeIngredients(
        recipe: RecipeDetail,
        mapping: RecipeProductMappingResponse,
        includeFreeIngredients: Bool,
        selectedIngredientIDs: Set<UUID>? = nil,
        to listID: UUID? = nil
    ) -> [ShoppingListItem] {
        let targetListID = resolvedTargetListID(preferred: listID)
        guard let targetListID else {
            return []
        }

        let statusByIngredientID = Dictionary(
            uniqueKeysWithValues: mapping.ingredients.map { ($0.ingredientId, $0) }
        )
        var changedItems: [ShoppingListItem] = []

        mutateList(id: targetListID) { list in
            var nextOrder = nextSortOrder(in: list.items)

            for ingredient in recipe.ingredients.sorted(by: { $0.position < $1.position }) {
                if let selectedIngredientIDs,
                   !selectedIngredientIDs.contains(ingredient.id) {
                    continue
                }

                let mappingStatus = statusByIngredientID[ingredient.id]
                let sourceNote = recipeIngredientNote(
                    ingredient: ingredient,
                    recipeName: recipe.displayTitle
                )

                if let mappedProduct = mappingStatus?.product,
                   let product = mappedProduct.product {
                    if let existingIndex = list.items.firstIndex(where: {
                        $0.productID == product.id
                            && $0.layoutCode == product.layoutCode
                            && $0.status == .open
                    }) {
                        list.items[existingIndex].quantity += 1
                        list.items[existingIndex].note = mergedShoppingNote(
                            existing: list.items[existingIndex].note,
                            incoming: sourceNote
                        )
                        list.items[existingIndex].sourceRecipeId = list.items[existingIndex].sourceRecipeId ?? recipe.id
                        list.items[existingIndex].sourceRecipeName = mergedSourceText(
                            existing: list.items[existingIndex].sourceRecipeName,
                            incoming: recipe.displayTitle
                        )
                        list.items[existingIndex].ingredientName = list.items[existingIndex].ingredientName ?? ingredient.cleanLocalizedDisplayName
                        list.items[existingIndex].ingredientQuantity = list.items[existingIndex].ingredientQuantity ?? ingredient.quantityTextForList
                        list.items[existingIndex].ingredientUnit = list.items[existingIndex].ingredientUnit ?? ingredient.displayUnitForList
                        list.items[existingIndex].mappingConfidence = mappingStatus?.confidence
                        list.items[existingIndex].manuallyConfirmed = mappingStatus?.manuallyConfirmed
                        list.items[existingIndex].updatedAt = Date()
                        changedItems.append(list.items[existingIndex])
                    } else {
                        let item = ShoppingListItem(
                            product: product,
                            sortOrder: nextOrder,
                            sourceRecipeId: recipe.id,
                            sourceRecipeName: recipe.displayTitle,
                            ingredientName: ingredient.cleanLocalizedDisplayName,
                            ingredientQuantity: ingredient.quantityTextForList,
                            ingredientUnit: ingredient.displayUnitForList,
                            mappingConfidence: mappingStatus?.confidence,
                            manuallyConfirmed: mappingStatus?.manuallyConfirmed
                        )
                        list.items.append(item)
                        changedItems.append(item)
                        nextOrder += 1
                    }
                    continue
                }

                guard includeFreeIngredients else {
                    continue
                }

                let normalizedName = normalizedIngredientName(ingredient.cleanLocalizedDisplayName)
                if let existingIndex = list.items.firstIndex(where: {
                    $0.productID == nil
                        && $0.status == .open
                        && normalizedIngredientName($0.ingredientName ?? $0.name) == normalizedName
                        && $0.sourceRecipeId == recipe.id
                }) {
                    list.items[existingIndex].quantity += 1
                    list.items[existingIndex].note = mergedShoppingNote(
                        existing: list.items[existingIndex].note,
                        incoming: sourceNote
                    )
                    list.items[existingIndex].updatedAt = Date()
                    changedItems.append(list.items[existingIndex])
                } else {
                    let item = ShoppingListItem(
                        freeIngredientName: ingredient.cleanLocalizedDisplayName,
                        sortOrder: nextOrder,
                        sourceRecipeId: recipe.id,
                        sourceRecipeName: recipe.displayTitle,
                        ingredientQuantity: ingredient.quantityTextForList,
                        ingredientUnit: ingredient.displayUnitForList
                    )
                    list.items.append(item)
                    changedItems.append(item)
                    nextOrder += 1
                }
            }

            if !changedItems.isEmpty {
                list.updatedAt = Date()
            }
        }

        return changedItems
    }

    func updateItemStatus(
        _ itemID: UUID,
        in listID: UUID,
        status: ShoppingListItemStatus
    ) {
        mutateList(id: listID) { list in
            guard let index = list.items.firstIndex(where: { $0.id == itemID }) else {
                return
            }
            list.items[index].status = status
            list.items[index].updatedAt = Date()
            list.updatedAt = Date()
        }
    }

    func updateItemQuantity(
        _ itemID: UUID,
        in listID: UUID,
        quantity rawQuantity: Int
    ) {
        if rawQuantity <= 0 {
            removeItem(itemID, from: listID)
            return
        }

        let quantity = max(1, rawQuantity)
        mutateList(id: listID) { list in
            guard let index = list.items.firstIndex(where: { $0.id == itemID }) else {
                return
            }
            guard list.items[index].quantity != quantity else {
                return
            }

            list.items[index].quantity = quantity
            list.items[index].updatedAt = Date()
            list.updatedAt = Date()
        }
    }

    func updateItemNote(
        _ itemID: UUID,
        in listID: UUID,
        note: String?
    ) {
        let normalizedNote = normalizedShoppingNote(note)

        mutateList(id: listID) { list in
            guard let index = list.items.firstIndex(where: { $0.id == itemID }) else {
                return
            }
            guard list.items[index].trimmedNote != normalizedNote else {
                return
            }

            list.items[index].note = normalizedNote
            list.items[index].updatedAt = Date()
            list.updatedAt = Date()
        }
    }

    func markItems(
        _ itemIDs: [UUID],
        in listID: UUID,
        status: ShoppingListItemStatus
    ) {
        guard !itemIDs.isEmpty else {
            return
        }

        mutateList(id: listID) { list in
            var didChange = false
            for index in list.items.indices where itemIDs.contains(list.items[index].id) {
                list.items[index].status = status
                list.items[index].updatedAt = Date()
                didChange = true
            }
            if didChange {
                list.updatedAt = Date()
            }
        }
    }

    func removeItem(_ itemID: UUID, from listID: UUID) {
        mutateList(id: listID) { list in
            let originalCount = list.items.count
            list.items.removeAll { $0.id == itemID }
            if list.items.count != originalCount {
                list.updatedAt = Date()
            }
        }
    }

    func clearCompletedItems(in listID: UUID) {
        mutateList(id: listID) { list in
            let originalCount = list.items.count
            list.items.removeAll { $0.status.isCompleted }
            if list.items.count != originalCount {
                list.updatedAt = Date()
            }
        }
    }

    func openItems(in listID: UUID) -> [ShoppingListItem] {
        guard let list = list(with: listID) else {
            return []
        }

        return list.items
            .filter { $0.status == .open }
            .sorted(by: ShoppingListItem.sortByListOrder)
    }

    func moveOpenItems(
        in listID: UUID,
        fromOffsets: IndexSet,
        toOffset: Int
    ) {
        guard !fromOffsets.isEmpty else {
            return
        }

        mutateList(id: listID) { list in
            let openItems = list.items
                .filter { $0.status == .open }
                .sorted(by: ShoppingListItem.sortByListOrder)
            guard !openItems.isEmpty else {
                return
            }

            let reorderedOpenItems = movedItems(
                openItems,
                fromOffsets: fromOffsets,
                toOffset: toOffset
            )
            applyOpenItemOrder(reorderedOpenItems, to: &list)
            list.updatedAt = Date()
        }
    }

    func moveOpenItem(
        _ itemID: UUID,
        in listID: UUID,
        by offset: Int
    ) {
        guard offset != 0 else {
            return
        }

        mutateList(id: listID) { list in
            var openItems = list.items
                .filter { $0.status == .open }
                .sorted(by: ShoppingListItem.sortByListOrder)

            guard let currentIndex = openItems.firstIndex(where: { $0.id == itemID }) else {
                return
            }

            let targetIndex = max(0, min(openItems.count - 1, currentIndex + offset))
            guard currentIndex != targetIndex else {
                return
            }

            let movingItem = openItems.remove(at: currentIndex)
            openItems.insert(movingItem, at: targetIndex)
            applyOpenItemOrder(openItems, to: &list)
            list.updatedAt = Date()
        }
    }

    func makeTransferPackage(
        for listID: UUID,
        itemIDs: Set<UUID>? = nil,
        kind: ShoppingTransferKind,
        senderDisplayName: String? = nil,
        note: String? = nil
    ) throws -> ShoppingTransferPackage {
        guard let list = list(with: listID) else {
            throw ShoppingTransferError.emptySelection
        }

        let items: [ShoppingListItem]
        if let itemIDs {
            items = list.items
                .filter { itemIDs.contains($0.id) }
                .sorted(by: ShoppingListItem.sortByListOrder)
        } else {
            items = list.items.sorted(by: ShoppingListItem.sortByListOrder)
        }

        let transferItems = items.compactMap { ShoppingTransferItem(item: $0) }

        return try ShoppingTransferService.makePackage(
            from: list,
            items: transferItems,
            kind: kind,
            senderDisplayName: senderDisplayName,
            note: note
        )
    }

    func makeTransferPackage(
        for listID: UUID,
        selections: [ShoppingShareSelection]? = nil,
        kind: ShoppingTransferKind,
        senderDisplayName: String? = nil,
        note: String? = nil
    ) throws -> ShoppingTransferPackage {
        guard let list = list(with: listID) else {
            throw ShoppingTransferError.emptySelection
        }

        guard let selections else {
            let transferItems = list.items
                .sorted(by: ShoppingListItem.sortByListOrder)
                .compactMap { ShoppingTransferItem(item: $0) }

            return try ShoppingTransferService.makePackage(
                from: list,
                items: transferItems,
                kind: kind,
                senderDisplayName: senderDisplayName,
                note: note
            )
        }

        let quantityByItemID = Dictionary(
            selections.map { ($0.itemID, max(1, $0.quantity)) },
            uniquingKeysWith: { _, rhs in rhs }
        )

        let transferItems = list.items
            .filter { quantityByItemID[$0.id] != nil }
            .sorted(by: ShoppingListItem.sortByListOrder)
            .compactMap { item -> ShoppingTransferItem? in
                guard let quantity = quantityByItemID[item.id] else {
                    return nil
                }
                return ShoppingTransferItem(item: item, quantity: quantity)
            }

        return try ShoppingTransferService.makePackage(
            from: list,
            items: transferItems,
            kind: kind,
            senderDisplayName: senderDisplayName,
            note: note
        )
    }

    @discardableResult
    func importPackageAsNewList(
        _ package: ShoppingTransferPackage,
        preferredName rawName: String? = nil
    ) -> UUID? {
        let baseName = (rawName ?? package.suggestedImportedListName)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let listName = baseName.isEmpty ? "Importierte Einkaufsliste" : baseName

        var list = ShoppingList(name: listName)
        list.items = package.items.enumerated().map { offset, item in
            ShoppingListItem(transferItem: item, sortOrder: offset)
        }
        list.updatedAt = Date()

        lists.insert(list, at: 0)
        selectedListID = list.id
        persist()
        return list.id
    }

    func mergePackage(_ package: ShoppingTransferPackage, into listID: UUID) {
        guard lists.contains(where: { $0.id == listID }) else {
            return
        }

        selectedListID = listID
        mutateList(id: listID) { list in
            var nextImportedSortOrder = nextSortOrder(in: list.items)

            for transferItem in package.items {
                if transferItem.status == .open,
                   let existingIndex = list.items.firstIndex(where: {
                       $0.productID == transferItem.productID
                           && $0.layoutCode == transferItem.layoutCode
                           && $0.status == .open
                   }) {
                    list.items[existingIndex].quantity += transferItem.quantity
                    list.items[existingIndex].updatedAt = Date()
                    list.items[existingIndex].note = mergedShoppingNote(
                        existing: list.items[existingIndex].note,
                        incoming: transferItem.note
                    )
                } else {
                    list.items.append(
                        ShoppingListItem(
                            transferItem: transferItem,
                            sortOrder: nextImportedSortOrder
                        )
                    )
                    nextImportedSortOrder += 1
                }
            }

            list.updatedAt = Date()
        }
    }

    func removeSharedSelections(
        _ selections: [ShoppingShareSelection],
        from listID: UUID
    ) {
        guard !selections.isEmpty else {
            return
        }

        let quantityByItemID = Dictionary(
            selections.map { ($0.itemID, max(1, $0.quantity)) },
            uniquingKeysWith: { lhs, rhs in lhs + rhs }
        )

        mutateList(id: listID) { list in
            var didChange = false

            for index in list.items.indices.reversed() {
                let itemID = list.items[index].id
                guard let removedQuantity = quantityByItemID[itemID] else {
                    continue
                }

                didChange = true
                if list.items[index].quantity <= removedQuantity {
                    list.items.remove(at: index)
                } else {
                    list.items[index].quantity -= removedQuantity
                    list.items[index].updatedAt = Date()
                }
            }

            if didChange {
                list.updatedAt = Date()
            }
        }
    }

    func removeItems(_ itemIDs: Set<UUID>, from listID: UUID) {
        guard !itemIDs.isEmpty else {
            return
        }

        mutateList(id: listID) { list in
            let originalCount = list.items.count
            list.items.removeAll { itemIDs.contains($0.id) }
            if list.items.count != originalCount {
                list.updatedAt = Date()
            }
        }
    }

    private func resolvedTargetListID(preferred listID: UUID?) -> UUID? {
        if let listID, lists.contains(where: { $0.id == listID }) {
            return listID
        }
        if let selectedListID, lists.contains(where: { $0.id == selectedListID }) {
            return selectedListID
        }
        return lists.first?.id
    }

    private func nextSortOrder(in items: [ShoppingListItem]) -> Int {
        (items.map(\.effectiveSortOrder).max() ?? -1) + 1
    }

    private func applyOpenItemOrder(
        _ orderedOpenItems: [ShoppingListItem],
        to list: inout ShoppingList
    ) {
        let sortOrderByID = Dictionary(
            uniqueKeysWithValues: orderedOpenItems.enumerated().map { index, item in
                (item.id, index)
            }
        )

        for index in list.items.indices {
            guard let sortOrder = sortOrderByID[list.items[index].id] else {
                continue
            }

            list.items[index].sortOrder = sortOrder
            list.items[index].updatedAt = Date()
        }
    }

    private func mutateList(id: UUID, _ mutate: (inout ShoppingList) -> Void) {
        guard let index = lists.firstIndex(where: { $0.id == id }) else {
            return
        }
        mutate(&lists[index])
        if selectedListID == nil {
            selectedListID = lists[index].id
        }
        persist()
    }

    private func ensureDefaultListExists() {
        if lists.isEmpty {
            let defaultList = ShoppingList(name: "Meine Einkaufsliste")
            lists = [defaultList]
            selectedListID = defaultList.id
            persist()
            return
        }

        if selectedListID == nil || lists.contains(where: { $0.id == selectedListID }) == false {
            selectedListID = lists.first?.id
            persist()
        }
    }

    private func load() {
        let snapshot = repository.initialSnapshot
        self.lists = snapshot.lists.filter { !$0.isArchived }
        self.selectedListID = snapshot.selectedListID
    }

    private func persist() {
        revision += 1
        persistGeneration += 1
        let repository = repository
        let lists = lists
        let selectedListID = selectedListID
        let generation = persistGeneration
        let previous = lastSend
        lastSend = Task {
            await previous?.value
            await repository.setLists(lists, selectedListID: selectedListID, generation: generation)
        }
    }
}

/// Ereignis, das einen neuen Plan an die Navigations-Session meldet (design.md D1). Positionsupdates
/// sind kein Ereignis.
enum ShoppingSyncEvent {
    case listChanged
    case routeModeToggled
    case replanRequested
    case layoutChanged
}

extension ShoppingStop {
    var navigationStop: NavigationStop {
        NavigationStop(id: id, title: title, mapPoint: SIMD2<Float>(mapPoint))
    }
}

@MainActor
final class ShoppingSessionManager: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var activeListID: UUID?
    @Published private(set) var routeMode: ShoppingRouteMode = .optimized
    @Published private(set) var snapshot: ShoppingRouteSnapshot?
    @Published private(set) var revision = 0

    private weak var navigationSession: NavigationSession?
    private let repository: ShoppingListRepository
    private var persistGeneration = 0
    private var lastSend: Task<Void, Never>?

    /// Aktive Tour-Liste und Routenmodus liegen mit den Listen in `lists.json` (vorher `UserDefaults`).
    init(repository: ShoppingListRepository = ShoppingPersistence.shared) {
        self.repository = repository
        let snapshot = repository.initialSnapshot
        self.routeMode = snapshot.routeMode
        self.activeListID = snapshot.activeTourListID
    }

    var isActive: Bool {
        activeListID != nil
    }

    /// Verbindet die Einkaufs-Session mit der Navigations-Session, die Plan, Route und aktiven Stopp besitzt.
    func bind(navigationSession: NavigationSession) {
        self.navigationSession = navigationSession
    }

    func startSession(
        for listID: UUID,
        listManager: ShoppingListManager,
        beaconManager: BeaconManager
    ) {
        activeListID = listID
        persistState()
        sync(listManager: listManager, beaconManager: beaconManager)
    }

    func stopSession(beaconManager: BeaconManager) {
        activeListID = nil
        snapshot = nil
        navigationSession?.stopTour()
        persistState()
        revision += 1
    }

    func toggleRouteMode(
        listManager: ShoppingListManager,
        beaconManager: BeaconManager
    ) {
        routeMode = routeMode == .optimized ? .listOrder : .optimized
        persistState()
        sync(listManager: listManager, beaconManager: beaconManager, event: .routeModeToggled)
    }

    /// „Neu planen“: Reihenfolge der offenen Stopps ab der aktuellen Position, der aktive Stopp darf wechseln.
    func replan(
        listManager: ShoppingListManager,
        beaconManager: BeaconManager
    ) {
        sync(listManager: listManager, beaconManager: beaconManager, event: .replanRequested)
    }

    /// Meldet ein Planungsereignis. Der Plan wird nur hier (und nie bei Positionsupdates) berechnet; der
    /// Snapshot entsteht immer aus dem in der Navigations-Session gespeicherten Plan.
    func sync(
        listManager: ShoppingListManager,
        beaconManager: BeaconManager,
        event: ShoppingSyncEvent = .listChanged
    ) {
        guard let activeListID,
              let list = listManager.list(with: activeListID) else {
            if snapshot != nil {
                snapshot = nil
                navigationSession?.stopTour()
                revision += 1
            }
            return
        }

        let resolved = ShoppingStopResolver.resolve(for: list, layoutElements: beaconManager.shelves)

        guard let session = navigationSession else {
            let ordered = ShoppingStopResolver.orderedStops(
                resolved.stops,
                start: planningStart(beaconManager: beaconManager),
                graph: beaconManager.navigationGraph,
                mode: routeMode
            )
            snapshot = ShoppingStopResolver.makeSnapshot(from: resolved, routeMode: routeMode, orderedStops: ordered)
            revision += 1
            return
        }

        apply(event: event, resolved: resolved, session: session, beaconManager: beaconManager)
        snapshot = storedSnapshot(resolved: resolved, session: session)
        revision += 1
    }

    func previewSnapshot(
        for listID: UUID,
        listManager: ShoppingListManager,
        beaconManager: BeaconManager,
        mode: ShoppingRouteMode? = nil
    ) -> ShoppingRouteSnapshot? {
        guard let list = listManager.list(with: listID) else {
            return nil
        }

        return ShoppingStopResolver.makeSnapshot(
            for: list,
            routeMode: mode ?? routeMode,
            userPosition: beaconManager.userPosition,
            graph: beaconManager.navigationGraph,
            layoutElements: beaconManager.shelves
        )
    }

    func markCurrentStopDone(
        listManager: ShoppingListManager,
        beaconManager: BeaconManager
    ) {
        advanceCurrentStop(
            status: .done,
            listManager: listManager,
            beaconManager: beaconManager
        )
    }

    func skipCurrentStop(
        listManager: ShoppingListManager,
        beaconManager: BeaconManager
    ) {
        advanceCurrentStop(
            status: .skipped,
            listManager: listManager,
            beaconManager: beaconManager
        )
    }

    /// Erledigt/uebersprungen wirkt auf den gespeicherten aktiven Stopp. Die Session rueckt auf den
    /// naechsten Stopp des gespeicherten Plans vor; es wird nichts neu optimiert.
    private func advanceCurrentStop(
        status: ShoppingListItemStatus,
        listManager: ShoppingListManager,
        beaconManager: BeaconManager
    ) {
        guard let activeListID,
              let currentStop = snapshot?.currentStop else {
            sync(listManager: listManager, beaconManager: beaconManager)
            return
        }

        if status == .skipped {
            navigationSession?.stopSkipped()
        } else {
            navigationSession?.stopCompleted()
        }
        listManager.markItems(currentStop.itemIDs, in: activeListID, status: status)
        // Die Stoppmenge entspricht jetzt dem gespeicherten Plan: nur der Snapshot wird neu aufgebaut.
        sync(listManager: listManager, beaconManager: beaconManager)
    }

    // MARK: - Planung

    private func planningStart(beaconManager: BeaconManager) -> SIMD2<Float>? {
        ShoppingStopResolver.planningStart(position: beaconManager.userPosition, layoutElements: beaconManager.shelves)
    }

    private func apply(
        event: ShoppingSyncEvent,
        resolved: ResolvedShoppingList,
        session: NavigationSession,
        beaconManager: BeaconManager
    ) {
        func fullPlan() -> [NavigationStop] {
            ShoppingStopResolver.orderedStops(
                resolved.stops,
                start: planningStart(beaconManager: beaconManager),
                graph: beaconManager.navigationGraph,
                mode: routeMode
            ).map(\.navigationStop)
        }

        switch event {
        case .routeModeToggled:
            if session.mode == .tour {
                session.routeModeToggled(plan: fullPlan())
            } else {
                session.startTour(plan: fullPlan())
            }
        case .replanRequested:
            if session.mode == .tour {
                session.replanRequested(plan: fullPlan())
            } else {
                session.startTour(plan: fullPlan())
            }
        case .layoutChanged:
            session.layoutChanged(plan: fullPlan())
        case .listChanged:
            guard session.mode == .tour else {
                session.startTour(plan: fullPlan())
                return
            }
            let planStops = resolved.stops.map(\.planStop)
            let entrance = ShoppingStopResolver.entrancePoint(in: beaconManager.shelves)
            let projected = beaconManager.userPosition.map { SIMD2<Float>($0) }
            if let plan = TourPlanner.planAfterListChange(
                resolved: planStops,
                storedPlanIDs: session.plan.map(\.id),
                activeStopID: session.activeStopID,
                projectedStart: projected,
                entranceStart: entrance,
                graph: beaconManager.navigationGraph,
                mode: routeMode.planningMode
            ) {
                session.listChanged(plan: plan.map(\.navigationStop))
            }
        }
    }

    /// Snapshot aus dem gespeicherten Plan der Session: gleiche Reihenfolge, aktiver Stopp zuerst.
    private func storedSnapshot(
        resolved: ResolvedShoppingList,
        session: NavigationSession
    ) -> ShoppingRouteSnapshot {
        let byID = Dictionary(resolved.stops.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var ordered = session.plan.compactMap { byID[$0.id] }
        let plannedIDs = Set(ordered.map(\.id))
        ordered.append(contentsOf: resolved.stops.filter { !plannedIDs.contains($0.id) })
        return ShoppingStopResolver.makeSnapshot(from: resolved, routeMode: routeMode, orderedStops: ordered)
    }

    func banner() -> ShoppingSessionBanner? {
        guard let snapshot,
              let currentStop = snapshot.currentStop else {
            return nil
        }

        return ShoppingSessionBanner(
            listName: snapshot.listName,
            currentStopTitle: currentStop.title,
            remainingStopCount: snapshot.remainingStopCount,
            remainingProductCount: snapshot.remainingProductCount,
            unresolvedProductCount: snapshot.unresolvedProductCount
        )
    }

    private func persistState() {
        persistGeneration += 1
        let repository = repository
        let activeListID = activeListID
        let routeMode = routeMode
        let generation = persistGeneration
        let previous = lastSend
        lastSend = Task {
            await previous?.value
            await repository.setSession(activeTourListID: activeListID, routeMode: routeMode, generation: generation)
        }
    }

    /// Wartet, bis alle Zustandsaenderungen beim Repository angekommen sind (vor `ShoppingListManager.flush()`).
    func drainPendingWrites() async {
        await lastSend?.value
    }
}
