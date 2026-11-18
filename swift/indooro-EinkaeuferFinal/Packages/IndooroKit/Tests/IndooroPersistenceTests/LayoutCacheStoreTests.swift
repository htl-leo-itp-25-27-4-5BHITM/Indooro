import XCTest
@testable import IndooroPersistence

/// Task 6.1: Datei-Cache fuer Layout-Antworten (Offline-Start).
final class LayoutCacheStoreTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("LayoutCacheStoreTests-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDownWithError() throws {
        if let directory {
            try? FileManager.default.removeItem(at: directory)
        }
    }

    private func payload(_ text: String) -> Data {
        Data("{\"shopName\":\"\(text)\"}".utf8)
    }

    func testRoundTripStoreLayoutReturnsSameBytesAndRecentDate() throws {
        let cache = LayoutCacheStore(directory: directory)
        let storeID = UUID().uuidString
        let data = payload("Pilot")

        let before = Date().addingTimeInterval(-5)
        cache.save(data, storeID: storeID)
        let loaded = try XCTUnwrap(cache.load(storeID: storeID))

        XCTAssertEqual(loaded.data, data)
        XCTAssertGreaterThanOrEqual(loaded.savedAt, before)
        XCTAssertLessThanOrEqual(loaded.savedAt, Date().addingTimeInterval(5))
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.appendingPathComponent("\(storeID).json").path))
    }

    func testDefaultLayoutIsStoredAsDefaultJSON() throws {
        let cache = LayoutCacheStore(directory: directory)
        let data = payload("Default")

        cache.save(data, storeID: nil)

        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.appendingPathComponent("default.json").path))
        XCTAssertEqual(try XCTUnwrap(cache.load(storeID: nil)).data, data)

        let otherStoreID = UUID().uuidString
        XCTAssertNil(cache.load(storeID: otherStoreID))
    }

    func testSaveOverwritesPreviousContent() throws {
        let cache = LayoutCacheStore(directory: directory)
        cache.save(payload("alt"), storeID: nil)
        cache.save(payload("neu"), storeID: nil)

        XCTAssertEqual(try XCTUnwrap(cache.load(storeID: nil)).data, payload("neu"))
    }

    func testMissingFileReturnsNil() {
        let cache = LayoutCacheStore(directory: directory)
        XCTAssertNil(cache.load(storeID: UUID().uuidString))
        XCTAssertNil(cache.load(storeID: nil))
    }

    func testInvalidStoreIDsAreRejectedAndWriteNothing() {
        let cache = LayoutCacheStore(directory: directory)
        let invalidIDs = ["", "../escape", "a/b", "store id", "store.json", "default", "DEFAULT", "ü-ä"]

        for storeID in invalidIDs {
            cache.save(payload("x"), storeID: storeID)
            XCTAssertNil(cache.load(storeID: storeID), "ID \(storeID) darf nicht lesbar sein")
            XCTAssertFalse(LayoutCacheStore.isValidStoreID(storeID), "ID \(storeID) muss abgelehnt werden")
        }

        let contents = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        XCTAssertTrue(contents.isEmpty, "Abgelehnte IDs duerfen keine Dateien anlegen: \(contents)")
    }

    func testUUIDStoreIDIsAccepted() {
        XCTAssertTrue(LayoutCacheStore.isValidStoreID(UUID().uuidString))
        XCTAssertTrue(LayoutCacheStore.isValidStoreID(UUID().uuidString.lowercased()))
    }

    func testDirectoryIsCreatedOnFirstSave() throws {
        let nested = directory.appendingPathComponent("nested", isDirectory: true)
        let cache = LayoutCacheStore(directory: nested)

        XCTAssertFalse(FileManager.default.fileExists(atPath: nested.path))
        cache.save(payload("x"), storeID: nil)

        XCTAssertTrue(FileManager.default.fileExists(atPath: nested.appendingPathComponent("default.json").path))
    }

    func testSavedFilesAreExcludedFromBackup() throws {
        let cache = LayoutCacheStore(directory: directory)
        let storeID = UUID().uuidString
        cache.save(payload("a"), storeID: storeID)
        cache.save(payload("b"), storeID: nil)

        for name in ["\(storeID).json", "default.json"] {
            let url = directory.appendingPathComponent(name)
            let values = try url.resourceValues(forKeys: [.isExcludedFromBackupKey])
            XCTAssertEqual(values.isExcludedFromBackup, true, "\(name) muss vom Backup ausgeschlossen sein")
        }
    }
}
