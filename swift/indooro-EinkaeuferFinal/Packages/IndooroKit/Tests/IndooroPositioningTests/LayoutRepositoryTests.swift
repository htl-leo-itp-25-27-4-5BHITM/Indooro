import Foundation
import IndooroModels
import IndooroNetworking
import IndooroPersistence
import XCTest
@testable import IndooroPositioning

/// Task 9.5: `LayoutRepository` – Kette Server -> Offline-Kopie -> Verlauf -> Bundle.
final class LayoutRepositoryTests: XCTestCase {
    private var directory: URL!
    private var client: FakeAPIClient!
    private var cache: LayoutCacheStore!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("layout-repo-\(UUID().uuidString)")
        cache = LayoutCacheStore(directory: directory)
        client = FakeAPIClient()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func makeRepository(bundle: LayoutData? = nil) -> LayoutRepository {
        LayoutRepository(client: client, cache: cache, bundleLayout: { bundle })
    }

    private func store(_ name: String = "Filiale") -> MobileStoreSummary {
        MobileStoreSummary(id: UUID(), storeCode: "S1", name: name, city: "Leonding")
    }

    private func storeLayoutPath(_ store: MobileStoreSummary) -> String {
        "/mobile/stores/\(store.id.uuidString.lowercased())/layout/current"
    }

    private func mobileLayoutJSON(fallback: Bool) throws -> Data {
        let layout = try JSONSerialization.jsonObject(with: openLayoutJSON())
        return try JSONSerialization.data(withJSONObject: ["fallback": fallback, "layout": layout])
    }

    func testServerLayoutIsReturnedAndCached() async throws {
        client.respond("/layout/current", with: .success(openLayoutJSON()))
        let result = await makeRepository().loadCurrent()
        let loaded = try XCTUnwrap(result)
        XCTAssertEqual(loaded.source, .server)
        XCTAssertEqual(loaded.layout.shopName, "Test")
        XCTAssertNotNil(cache.load(storeID: nil))
    }

    func testServerFailureFallsBackToOfflineCopyWithReason() async throws {
        cache.save(openLayoutJSON(), storeID: nil)
        client.respond("/layout/current", with: .failure(.offline))
        let result = await makeRepository().loadCurrent()
        let loaded = try XCTUnwrap(result)
        guard case .offlineCache = loaded.source else { return XCTFail("Erwartet offlineCache, erhalten \(loaded.source)") }
        XCTAssertNotNil(loaded.reason)
    }

    func testUnreadableServerLayoutFallsBackToOfflineCopy() async throws {
        cache.save(openLayoutJSON(), storeID: nil)
        client.respond("/layout/current", with: .success(Data("{\"unexpected\": true}".utf8)))
        let result = await makeRepository().loadCurrent()
        let loaded = try XCTUnwrap(result)
        guard case .offlineCache = loaded.source else { return XCTFail("Erwartet offlineCache, erhalten \(loaded.source)") }
        XCTAssertEqual(loaded.reason, "Server-Layout nicht lesbar")
    }

    func testLastSelectedStoreCacheWinsOverDefaultCache() async throws {
        let selected = store("Gewaehlt")
        cache.save(try mobileLayoutJSON(fallback: false), storeID: selected.id.uuidString)
        client.respond("/layout/current", with: .failure(.offline))
        let result = await makeRepository().loadCurrent(lastSelectedStore: selected)
        let loaded = try XCTUnwrap(result)
        XCTAssertEqual(loaded.store, selected)
        XCTAssertTrue(loaded.isServerFallback)
    }

    func testHistoryIsUsedWhenNoCacheExists() async throws {
        client.respond("/layout/current", with: .failure(.offline))
        client.respond(
            "/layout/history",
            with: .success(Data(#"[{"layoutId": "v7", "shopName": "Test"}]"#.utf8))
        )
        client.respond("/layout/versions/v7", with: .success(openLayoutJSON()))
        let result = await makeRepository().loadCurrent()
        let loaded = try XCTUnwrap(result)
        XCTAssertEqual(loaded.source, .history(layoutID: "v7"))
    }

    func testBundleIsTheLastResort() async throws {
        client.respond("/layout/current", with: .failure(.offline))
        client.respond("/layout/history", with: .failure(.offline))
        let bundle = try makeOpenLayout()
        let result = await makeRepository(bundle: bundle).loadCurrent()
        let loaded = try XCTUnwrap(result)
        XCTAssertEqual(loaded.source, .bundle)
        XCTAssertNotNil(loaded.reason)
    }

    func testNothingAvailableReturnsNil() async {
        client.respond("/layout/current", with: .failure(.offline))
        client.respond("/layout/history", with: .failure(.offline))
        let loaded = await makeRepository().loadCurrent()
        XCTAssertNil(loaded)
    }

    func testStoreLayoutReadsFallbackFlagAndCaches() async throws {
        let target = store()
        client.respond(storeLayoutPath(target), with: .success(try mobileLayoutJSON(fallback: true)))
        let loaded = try await makeRepository().loadStoreLayout(for: target)
        XCTAssertEqual(loaded.source, .server)
        XCTAssertTrue(loaded.isServerFallback)
        XCTAssertEqual(loaded.store, target)
        XCTAssertNotNil(cache.load(storeID: target.id.uuidString))
    }

    func testStoreLayoutFailureUsesOfflineCopyOrThrows() async throws {
        let target = store()
        client.respond(storeLayoutPath(target), with: .failure(.offline))
        do {
            _ = try await makeRepository().loadStoreLayout(for: target)
            XCTFail("Erwartet unavailable")
        } catch let error as LayoutRepositoryError {
            guard case .unavailable = error else { return XCTFail("Falscher Fehler \(error)") }
        }

        cache.save(try mobileLayoutJSON(fallback: false), storeID: target.id.uuidString)
        let loaded = try await makeRepository().loadStoreLayout(for: target)
        guard case .offlineCache = loaded.source else { return XCTFail("Erwartet offlineCache") }
    }

    func testHistoryDecodesEnvelopeAndPlainList() async {
        client.respond("/layout/history", with: .success(Data(#"{"versions": [{"layoutId": 3, "shopName": "A"}]}"#.utf8)))
        let versions = await makeRepository().history(limit: 5)
        XCTAssertEqual(versions.map(\.layoutId), ["3"])
    }
}
