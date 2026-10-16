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

enum ShoppingStopResolver {
    static func makeSnapshot(
        for list: ShoppingList,
        routeMode: ShoppingRouteMode,
        userPosition: CGPoint?,
        gridWidth: Double,
        gridHeight: Double,
        layoutElements: [LayoutElement]
    ) -> ShoppingRouteSnapshot {
        let completedItems = list.items
            .filter { $0.status.isCompleted }
            .sorted { $0.updatedAt > $1.updatedAt }

        let openItems = list.items
            .filter { $0.status == .open }
            .sorted { lhs, rhs in
                if lhs.addedAt == rhs.addedAt {
                    return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
                }
                return lhs.addedAt < rhs.addedAt
            }

        var grouped: [String: (shelf: ResolvedShoppingShelf, items: [ShoppingListItem])] = [:]
        var unresolvedItems: [ShoppingListItem] = []

        for item in openItems {
            guard let shelf = resolveShelf(for: item.layoutCode, elements: layoutElements) else {
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
                items: bucket.items.sorted { $0.addedAt < $1.addedAt },
                orderSeed: bucket.items.map(\.addedAt).min() ?? Date()
            )
        }

        let orderedStops = MultiStopRoutePlanner.order(
            stops: stops,
            startingAt: userPosition,
            gridWidth: gridWidth,
            gridHeight: gridHeight,
            layoutElements: layoutElements,
            mode: routeMode
        )

        return ShoppingRouteSnapshot(
            listID: list.id,
            listName: list.name,
            routeMode: routeMode,
            orderedStops: orderedStops,
            unresolvedItems: unresolvedItems,
            completedItems: completedItems
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
        gridWidth: Double,
        gridHeight: Double,
        layoutElements: [LayoutElement],
        mode: ShoppingRouteMode
    ) -> [ShoppingStop] {
        let listOrderedStops = stops.sorted { lhs, rhs in
            if lhs.orderSeed == rhs.orderSeed {
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
            return lhs.orderSeed < rhs.orderSeed
        }

        guard mode == .optimized,
              let userPosition,
              listOrderedStops.count > 1 else {
            return listOrderedStops
        }

        let graph = IndoorGraphBuilder.fromLayout(
            gridWidth: Int(gridWidth),
            gridHeight: Int(gridHeight),
            elements: layoutElements
        )

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
    func addProduct(_ product: Product, to listID: UUID? = nil) -> ShoppingListItem? {
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
                createdItem = list.items[existingIndex]
            } else {
                let item = ShoppingListItem(product: product)
                list.items.append(item)
                createdItem = item
            }
            list.updatedAt = Date()
        }

        return createdItem
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
            .sorted { lhs, rhs in
                if lhs.addedAt == rhs.addedAt {
                    return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
                }
                return lhs.addedAt < rhs.addedAt
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
                .sorted { lhs, rhs in
                    if lhs.addedAt == rhs.addedAt {
                        return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
                    }
                    return lhs.addedAt < rhs.addedAt
                }
        } else {
            items = list.items.sorted { lhs, rhs in
                if lhs.addedAt == rhs.addedAt {
                    return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
                }
                return lhs.addedAt < rhs.addedAt
            }
        }

        return try ShoppingTransferService.makePackage(
            from: list,
            items: items,
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
        list.items = package.items.map(ShoppingListItem.init(transferItem:))
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
            for transferItem in package.items {
                if transferItem.status == .open,
                   let existingIndex = list.items.firstIndex(where: {
                       $0.productID == transferItem.productID
                           && $0.layoutCode == transferItem.layoutCode
                           && $0.status == .open
                   }) {
                    list.items[existingIndex].quantity += transferItem.quantity
                    list.items[existingIndex].updatedAt = Date()
                    if list.items[existingIndex].note == nil {
                        list.items[existingIndex].note = transferItem.note
                    }
                } else {
                    list.items.append(ShoppingListItem(transferItem: transferItem))
                }
            }

            list.updatedAt = Date()
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

final class ShoppingSessionManager: ObservableObject {
    @Published private(set) var activeListID: UUID?
    @Published private(set) var routeMode: ShoppingRouteMode = .optimized
    @Published private(set) var snapshot: ShoppingRouteSnapshot?
    @Published private(set) var revision = 0

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
        beaconManager.clearRouteTarget()
        persistState()
        revision += 1
    }

    func toggleRouteMode(
        listManager: ShoppingListManager,
        beaconManager: BeaconManager
    ) {
        routeMode = routeMode == .optimized ? .listOrder : .optimized
        persistState()
        sync(listManager: listManager, beaconManager: beaconManager)
    }

    func sync(
        listManager: ShoppingListManager,
        beaconManager: BeaconManager
    ) {
        guard let activeListID,
              let list = listManager.list(with: activeListID) else {
            if snapshot != nil {
                snapshot = nil
                beaconManager.clearRouteTarget()
                revision += 1
            }
            return
        }

        let snapshot = ShoppingStopResolver.makeSnapshot(
            for: list,
            routeMode: routeMode,
            userPosition: beaconManager.userPosition ?? beaconManager.rawUserPosition,
            gridWidth: beaconManager.gridWidth,
            gridHeight: beaconManager.gridHeight,
            layoutElements: beaconManager.shelves
        )

        self.snapshot = snapshot
        if let currentStop = snapshot.currentStop {
            beaconManager.setRouteTargetPosition(currentStop.mapPoint)
        } else {
            beaconManager.clearRouteTarget()
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
            gridWidth: beaconManager.gridWidth,
            gridHeight: beaconManager.gridHeight,
            layoutElements: beaconManager.shelves
        )
    }

    func markCurrentStopDone(
        listManager: ShoppingListManager,
        beaconManager: BeaconManager
    ) {
        guard let snapshot,
              let currentStop = snapshot.currentStop else {
            return
        }
        listManager.markItems(currentStop.itemIDs, in: snapshot.listID, status: .done)
        sync(listManager: listManager, beaconManager: beaconManager)
    }

    func skipCurrentStop(
        listManager: ShoppingListManager,
        beaconManager: BeaconManager
    ) {
        guard let snapshot,
              let currentStop = snapshot.currentStop else {
            return
        }
        listManager.markItems(currentStop.itemIDs, in: snapshot.listID, status: .skipped)
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
