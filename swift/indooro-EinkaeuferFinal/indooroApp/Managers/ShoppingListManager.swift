import Foundation
import Combine
import CoreGraphics
import simd

private struct ShoppingListStore: Codable {
    var lists: [ShoppingList]
    var selectedListID: UUID?
}

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

enum ShoppingStopResolver {
    static func makeSnapshot(
        for list: ShoppingList,
        routeMode: ShoppingRouteMode,
        userPosition: CGPoint?,
        graph: IndoorGraph?,
        layoutElements: [LayoutElement]
    ) -> ShoppingRouteSnapshot {
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

        let orderedStops = MultiStopRoutePlanner.order(
            stops: stops,
            startingAt: userPosition,
            graph: graph,
            mode: routeMode
        )

        let totalStopCount = Set<Int64>(
            list.items.compactMap { item in
                guard let layoutCode = item.layoutCode else {
                    return nil
                }
                return resolveShelf(for: layoutCode, elements: layoutElements)?.id
            }
        ).count

        return ShoppingRouteSnapshot(
            listID: list.id,
            listName: list.name,
            routeMode: routeMode,
            orderedStops: orderedStops,
            unresolvedItems: unresolvedItems,
            completedItems: completedItems,
            totalStopCount: totalStopCount,
            totalProductCount: list.items.reduce(0) { $0 + $1.quantity }
        )
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

enum MultiStopRoutePlanner {
    static func order(
        stops: [ShoppingStop],
        startingAt userPosition: CGPoint?,
        graph: IndoorGraph?,
        mode: ShoppingRouteMode
    ) -> [ShoppingStop] {
        let listOrderedStops = stops.sorted { lhs, rhs in
            if lhs.orderSeed == rhs.orderSeed {
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
            return lhs.orderSeed < rhs.orderSeed
        }

        // Der Graph gehoert BeaconManager (einmal je Layout-Revision); hier wird er nur gelesen.
        guard mode == .optimized,
              let userPosition,
              let graph,
              listOrderedStops.count > 1 else {
            return listOrderedStops
        }

        var remainingStops = listOrderedStops
        var orderedStops: [ShoppingStop] = []
        var currentPoint = SIMD2<Float>(userPosition)

        while !remainingStops.isEmpty {
            let nextIndex = remainingStops.indices.min { lhs, rhs in
                let lhsDistance = routeDistance(
                    from: currentPoint,
                    to: remainingStops[lhs].mapPoint,
                    graph: graph
                )
                let rhsDistance = routeDistance(
                    from: currentPoint,
                    to: remainingStops[rhs].mapPoint,
                    graph: graph
                )

                if lhsDistance == rhsDistance {
                    return remainingStops[lhs].orderSeed < remainingStops[rhs].orderSeed
                }
                return lhsDistance < rhsDistance
            }

            guard let nextIndex else {
                break
            }

            let nextStop = remainingStops.remove(at: nextIndex)
            orderedStops.append(nextStop)
            currentPoint = SIMD2<Float>(nextStop.mapPoint)
        }

        return orderedStops
    }

    private static func routeDistance(
        from start: SIMD2<Float>,
        to endPoint: CGPoint,
        graph: IndoorGraph
    ) -> Float {
        let end = SIMD2<Float>(endPoint)
        return graph.plannedRouteCost(from: start, to: end, floor: 0)
    }
}

final class ShoppingListManager: ObservableObject {
    @Published private(set) var lists: [ShoppingList] = []
    @Published private(set) var selectedListID: UUID?
    @Published private(set) var revision = 0

    private let storeKey = "shoppingListStore.v1"

    init() {
        load()
        ensureDefaultListExists()
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
        guard let data = UserDefaults.standard.data(forKey: storeKey),
              let store = try? JSONDecoder().decode(ShoppingListStore.self, from: data) else {
            return
        }

        self.lists = store.lists.filter { !$0.isArchived }
        self.selectedListID = store.selectedListID
    }

    private func persist() {
        revision += 1
        let store = ShoppingListStore(lists: lists, selectedListID: selectedListID)
        if let data = try? JSONEncoder().encode(store) {
            UserDefaults.standard.set(data, forKey: storeKey)
        }
    }
}

/// Ereignis, das einen neuen Plan an die Navigations-Session meldet.
enum ShoppingSyncEvent {
    case listChanged
    case routeModeToggled
}

extension ShoppingStop {
    var navigationStop: NavigationStop {
        NavigationStop(id: id, title: title, mapPoint: SIMD2<Float>(mapPoint))
    }
}

extension ShoppingRouteSnapshot {
    /// Setzt den Stopp mit dieser ID an die erste Stelle (der aktive Stopp gehoert der Session).
    func promoting(stopID: String?) -> ShoppingRouteSnapshot {
        guard let stopID,
              let index = orderedStops.firstIndex(where: { $0.id == stopID }),
              index > 0 else {
            return self
        }
        var stops = orderedStops
        let active = stops.remove(at: index)
        stops.insert(active, at: 0)
        return ShoppingRouteSnapshot(
            listID: listID,
            listName: listName,
            routeMode: routeMode,
            orderedStops: stops,
            unresolvedItems: unresolvedItems,
            completedItems: completedItems,
            totalStopCount: totalStopCount,
            totalProductCount: totalProductCount
        )
    }
}

@MainActor
final class ShoppingSessionManager: ObservableObject {
    @Published private(set) var activeListID: UUID?
    @Published private(set) var routeMode: ShoppingRouteMode = .optimized
    @Published private(set) var snapshot: ShoppingRouteSnapshot?
    @Published private(set) var revision = 0

    private weak var navigationSession: NavigationSession?
    private let activeListKey = "shoppingSession.activeListID"
    private let routeModeKey = "shoppingSession.routeMode"

    init() {
        if let rawValue = UserDefaults.standard.string(forKey: routeModeKey),
           let routeMode = ShoppingRouteMode(rawValue: rawValue) {
            self.routeMode = routeMode
        }

        if let rawUUID = UserDefaults.standard.string(forKey: activeListKey),
           let uuid = UUID(uuidString: rawUUID) {
            self.activeListID = uuid
        }
    }

    var isActive: Bool {
        activeListID != nil
    }

    /// Verbindet die Einkaufs-Session mit der Navigations-Session, die Route und aktiven Stopp besitzt.
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

        let snapshot = ShoppingStopResolver.makeSnapshot(
            for: list,
            routeMode: routeMode,
            userPosition: beaconManager.userPosition ?? beaconManager.rawUserPosition,
            graph: beaconManager.navigationGraph,
            layoutElements: beaconManager.shelves
        )

        // Die Session behaelt den aktiven Stopp, solange er im Plan vorkommt; ein erneutes Setzen
        // desselben Ziels baut keine Route neu.
        let plan = snapshot.orderedStops.map(\.navigationStop)
        if let navigationSession {
            if plan.isEmpty {
                navigationSession.stopTour()
            } else if navigationSession.mode != .tour {
                navigationSession.startTour(plan: plan)
            } else if event == .routeModeToggled {
                navigationSession.routeModeToggled(plan: plan)
            } else {
                navigationSession.listChanged(plan: plan)
            }
            self.snapshot = snapshot.promoting(stopID: navigationSession.activeStopID)
        } else {
            self.snapshot = snapshot
        }
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
            userPosition: beaconManager.userPosition ?? beaconManager.rawUserPosition,
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

    private func advanceCurrentStop(
        status: ShoppingListItemStatus,
        listManager: ShoppingListManager,
        beaconManager: BeaconManager
    ) {
        guard let activeListID,
              let list = listManager.list(with: activeListID) else {
            return
        }

        let freshSnapshot = ShoppingStopResolver.makeSnapshot(
            for: list,
            routeMode: routeMode,
            userPosition: beaconManager.userPosition ?? beaconManager.rawUserPosition,
            graph: beaconManager.navigationGraph,
            layoutElements: beaconManager.shelves
        )

        // Erledigt/uebersprungen wirkt auf den gespeicherten aktiven Stopp der Session, nicht auf
        // den Stopp, der gerade am naechsten liegt.
        let activeID = navigationSession?.activeStopID
        guard let currentStop = freshSnapshot.orderedStops.first(where: { $0.id == activeID })
            ?? freshSnapshot.currentStop else {
            sync(listManager: listManager, beaconManager: beaconManager)
            return
        }

        if status == .skipped {
            navigationSession?.stopSkipped()
        } else {
            navigationSession?.stopCompleted()
        }
        listManager.markItems(currentStop.itemIDs, in: freshSnapshot.listID, status: status)
        sync(listManager: listManager, beaconManager: beaconManager)
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
        if let activeListID {
            UserDefaults.standard.set(activeListID.uuidString, forKey: activeListKey)
        } else {
            UserDefaults.standard.removeObject(forKey: activeListKey)
        }
        UserDefaults.standard.set(routeMode.rawValue, forKey: routeModeKey)
    }
}
