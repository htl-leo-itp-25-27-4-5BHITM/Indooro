import Foundation
import IndooroPersistence

/// Gemeinsames `ShoppingListRepository` der App: `ShoppingListManager` und `ShoppingSessionManager` schreiben in
/// dieselbe Datei `Application Support/ShoppingLists/lists.json`. Das Repository wird beim ersten Zugriff
/// synchron geladen (Migration aus `UserDefaults` inklusive).
enum ShoppingPersistence {
    static let shared: ShoppingListRepository = makeLive()

    private static func makeLive() -> ShoppingListRepository {
        #if DEBUG
        if BeaconManager.isUITesting {
            // UI-Tests (add-ios-pilot-ui-tests) starten mit leerer Liste und ohne aktive Tour: frueher durch die
            // Startargumente `-shoppingListStore.v1 ""` erreicht, jetzt ueber ein bei jedem Start geleertes Verzeichnis.
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("ShoppingLists-UITest", isDirectory: true)
            try? FileManager.default.removeItem(at: directory)
            return ShoppingListRepository(directory: directory)
        }
        #endif
        return ShoppingListRepository()
    }
}
