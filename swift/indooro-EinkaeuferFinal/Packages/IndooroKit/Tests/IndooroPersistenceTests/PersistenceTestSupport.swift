@preconcurrency import Foundation
import IndooroModels
import XCTest
@testable import IndooroPersistence

/// Fixtures aus `swift/indooro-EinkaeuferFinal/Fixtures` (relativ zu `#filePath`, wie in `IndooroModelsTests`).
enum PersistenceFixtures {
    static let directory: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // IndooroPersistenceTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // IndooroKit
        .deletingLastPathComponent() // Packages
        .deletingLastPathComponent() // swift/indooro-EinkaeuferFinal
        .appendingPathComponent("Fixtures", isDirectory: true)

    static func data(_ name: String) throws -> Data {
        try Data(contentsOf: directory.appendingPathComponent(name))
    }
}

/// Der alte Blob `shoppingListStore.v1`, exakt wie `ShoppingListManager.persist()` ihn geschrieben hat
/// (private `ShoppingListStore`, Standard-`JSONEncoder`/`JSONDecoder`).
struct LegacyShoppingListStore: Codable {
    var lists: [ShoppingList]
    var selectedListID: UUID?
}

/// Test-Zeitgeber: `sleep` kehrt erst nach `fire()` zurueck; Abbruch wirft `CancellationError`.
actor ManualSleeper {
    private var waiters: [Int: CheckedContinuation<Void, Error>] = [:]
    private var nextID = 0
    private(set) var requestCount = 0

    func sleep() async throws {
        let id = nextID
        nextID += 1
        requestCount += 1
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                if Task.isCancelled {
                    continuation.resume(throwing: CancellationError())
                } else {
                    waiters[id] = continuation
                }
            }
        } onCancel: {
            Task { await self.cancel(id) }
        }
    }

    private func cancel(_ id: Int) {
        waiters.removeValue(forKey: id)?.resume(throwing: CancellationError())
    }

    func fire() {
        let pending = waiters
        waiters = [:]
        for continuation in pending.values {
            continuation.resume()
        }
    }

    var pendingCount: Int { waiters.count }
}

/// Zaehlt Schreibvorgaenge und kann sie gezielt scheitern lassen.
final class WriteProbe: @unchecked Sendable {
    enum Mode { case succeed, failImmediately, failAfterPartialWrite }

    private let lock = NSLock()
    private var _count = 0
    private var _mode: Mode = .succeed

    var count: Int { lock.withLock { _count } }
    var mode: Mode {
        get { lock.withLock { _mode } }
        set { lock.withLock { _mode = newValue } }
    }

    var writer: ShoppingListRepository.FileWriter {
        { [self] data, url in
            let current = lock.withLock { () -> Mode in
                _count += 1
                return _mode
            }
            switch current {
            case .succeed:
                try ShoppingListRepository.durableWrite(data, to: url)
            case .failImmediately:
                throw CocoaError(.fileWriteOutOfSpace)
            case .failAfterPartialWrite:
                try data.prefix(data.count / 2).write(to: url)
                throw CocoaError(.fileWriteOutOfSpace)
            }
        }
    }
}

/// Temporaeres Verzeichnis plus isolierte `UserDefaults`-Suite pro Test.
class PersistenceTestCase: XCTestCase {
    var directory: URL!
    nonisolated(unsafe) var defaults: UserDefaults!
    private var suiteName: String!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("ShoppingListRepositoryTests-\(UUID().uuidString)", isDirectory: true)
        suiteName = "ShoppingListRepositoryTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)!
    }

    override func tearDownWithError() throws {
        if let directory {
            try? FileManager.default.removeItem(at: directory)
        }
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
    }

    var primaryURL: URL { directory.appendingPathComponent("lists.json") }
    var backupURL: URL { directory.appendingPathComponent("lists.json.bak") }
    var temporaryURL: URL { directory.appendingPathComponent("lists.json.tmp") }

    func fileNames() -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []).sorted()
    }

    func corruptFileNames() -> [String] {
        fileNames().filter { $0.hasPrefix("lists.corrupt-") && $0.hasSuffix(".json") }
    }

    func makeRepository(
        sleeper: @escaping ShoppingListRepository.Sleeper = { _ in },
        writer: @escaping ShoppingListRepository.FileWriter = ShoppingListRepository.durableWrite,
        now: @escaping @Sendable () -> Date = { Date(timeIntervalSince1970: 1_790_000_000) }
    ) -> ShoppingListRepository {
        ShoppingListRepository(directory: directory, defaults: defaults, sleeper: sleeper, writer: writer, now: now)
    }

    func sampleList(_ name: String) -> ShoppingList {
        var list = ShoppingList(name: name)
        let product = Product(id: 92, name: "Naturpur Bio-Milch 1L", price: 1.79, layoutCode: "520/2/1/1")
        list.items = [ShoppingListItem(product: product, quantity: 2, note: "laktosefrei", sortOrder: 0)]
        return list
    }

    /// Schreibt den alten Blob und die Sitzungsschluessel wie die App vor Phase 8.
    func seedLegacyDefaults(
        lists: [ShoppingList],
        selectedListID: UUID?,
        activeListID: UUID? = nil,
        routeMode: String? = nil
    ) throws {
        let blob = try JSONEncoder().encode(LegacyShoppingListStore(lists: lists, selectedListID: selectedListID))
        defaults.set(blob, forKey: ShoppingListLegacyKeys.store)
        if let activeListID {
            defaults.set(activeListID.uuidString, forKey: ShoppingListLegacyKeys.activeListID)
        }
        if let routeMode {
            defaults.set(routeMode, forKey: ShoppingListLegacyKeys.routeMode)
        }
    }

    func waitUntil(timeout: TimeInterval = 3, _ condition: @escaping @Sendable () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(for: .milliseconds(5))
        }
        return await condition()
    }

    func decodeFile(_ url: URL) throws -> ShoppingListSnapshot {
        try JSONDecoder().decode(ShoppingListSnapshot.self, from: Data(contentsOf: url))
    }
}
