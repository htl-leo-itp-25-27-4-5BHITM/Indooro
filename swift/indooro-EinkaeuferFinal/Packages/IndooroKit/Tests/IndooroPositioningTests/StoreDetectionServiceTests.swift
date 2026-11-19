import Foundation
import IndooroModels
import IndooroNetworking
import IndooroTestSupport
import XCTest
@testable import IndooroPositioning

private final class FakeStoreBackend: StoreDetectionBackend, @unchecked Sendable {
    enum Reply { case found, notFound, failure }

    private let lock = NSLock()
    private var reply: Reply = .found
    private var lookups = 0
    private var uuidLoads = 0
    private var uuids: Set<UUID> = []

    func setReply(_ reply: Reply) { lock.withLock { self.reply = reply } }
    func setUUIDs(_ uuids: Set<UUID>) { lock.withLock { self.uuids = uuids } }
    var lookupCount: Int { lock.withLock { lookups } }
    var uuidLoadCount: Int { lock.withLock { uuidLoads } }

    func store(for identity: BeaconIdentity) async throws -> StoreByBeaconResponse? {
        let current: Reply = lock.withLock {
            lookups += 1
            return reply
        }
        switch current {
        case .found:
            return StoreByBeaconResponse(
                store: MobileStoreSummary(id: UUID(), storeCode: "S1", name: "Filiale", city: "Leonding"),
                matchedBeacon: MatchedBeaconSummary(beaconId: UUID(), beaconCode: "B1", identityKey: identity.uuidLookupKey)
            )
        case .notFound: return nil
        case .failure: throw APIError.offline
        }
    }

    func detectionUUIDs() async throws -> Set<UUID> {
        lock.withLock {
            uuidLoads += 1
            return uuids
        }
    }
}

/// Task 9.4: `StoreDetectionService` (Untergrenze, Entdoppelung, Cooldown, UUID-Katalog).
final class StoreDetectionServiceTests: XCTestCase {
    private let identity = makeIdentity(minor: 7)

    private func make() -> (StoreDetectionService, FakeStoreBackend, TestClock) {
        let backend = FakeStoreBackend()
        let clock = TestClock()
        return (StoreDetectionService(backend: backend, clock: clock), backend, clock)
    }

    private func sample(rssi: Int, source: BeaconSample.Source = .advertisement(txPower: nil)) -> BeaconSample {
        BeaconSample(source: source, rssi: rssi, timestamp: 0, identity: identity)
    }

    func testDetectedStoreIsReportedWithIdentityKey() async throws {
        let (service, backend, _) = make()
        await service.observe(sample(rssi: -70))
        XCTAssertEqual(backend.lookupCount, 1)
        var iterator = service.events.makeAsyncIterator()
        guard case let .detected(response, key)? = await iterator.next() else { return XCTFail("Erwartet detected") }
        XCTAssertEqual(key, identity.uuidLookupKey)
        XCTAssertEqual(response.store.name, "Filiale")
    }

    func testSignalBelowFloorIsIgnored() async {
        let (service, backend, _) = make()
        await service.observe(sample(rssi: -96))
        XCTAssertEqual(backend.lookupCount, 0)
        await service.observe(sample(rssi: -95))
        XCTAssertEqual(backend.lookupCount, 1)
    }

    func testRangingWithoutRSSIUsesTheFloor() async {
        let (service, backend, _) = make()
        await service.observe(sample(rssi: 0, source: .ranging(accuracy: 2, proximity: .near)))
        XCTAssertEqual(backend.lookupCount, 1)
    }

    func testActiveStoreIsNotLookedUpAgain() async {
        let (service, backend, _) = make()
        await service.observe(sample(rssi: -60))
        await service.markActive(identityKey: identity.uuidLookupKey)
        await service.observe(sample(rssi: -60))
        await service.observe(sample(rssi: -60))
        XCTAssertEqual(backend.lookupCount, 1)

        await service.clearActive()
        await service.observe(sample(rssi: -60))
        XCTAssertEqual(backend.lookupCount, 2)
    }

    func testNotFoundStartsCooldownForSameBeacon() async throws {
        let (service, backend, clock) = make()
        backend.setReply(.notFound)
        await service.observe(sample(rssi: -60))
        await service.observe(sample(rssi: -60))
        XCTAssertEqual(backend.lookupCount, 1, "Innerhalb des Cooldowns kein zweiter Lookup")

        clock.set(clock.now() + 16)
        await service.observe(sample(rssi: -60))
        XCTAssertEqual(backend.lookupCount, 2)

        var iterator = service.events.makeAsyncIterator()
        guard case .notFound? = await iterator.next() else { return XCTFail("Erwartet notFound") }
    }

    func testNetworkFailureHasNoCooldown() async {
        let (service, backend, _) = make()
        backend.setReply(.failure)
        await service.observe(sample(rssi: -60))
        await service.observe(sample(rssi: -60))
        XCTAssertEqual(backend.lookupCount, 2)
    }

    func testDetectionUUIDsAreRefreshedAtMostOncePerInterval() async {
        let (service, backend, clock) = make()
        let uuid = UUID()
        backend.setUUIDs([uuid])
        await service.refreshIdentitiesIfNeeded()
        await service.refreshIdentitiesIfNeeded()
        XCTAssertEqual(backend.uuidLoadCount, 1)

        clock.set(clock.now() + 61)
        await service.refreshIdentitiesIfNeeded()
        XCTAssertEqual(backend.uuidLoadCount, 2)

        await service.refreshIdentitiesIfNeeded(force: true)
        XCTAssertEqual(backend.uuidLoadCount, 3)

        var iterator = service.events.makeAsyncIterator()
        guard case let .detectionUUIDsChanged(uuids)? = await iterator.next() else {
            return XCTFail("Erwartet detectionUUIDsChanged")
        }
        XCTAssertEqual(uuids, [uuid])
    }

    func testSamplesStreamIsConsumedUntilStop() async throws {
        let (service, backend, _) = make()
        let radio = FakeBeaconRadio()
        await service.start(samples: radio.samples())
        radio.emit(sample(rssi: -60))
        for _ in 0..<2_000 where backend.lookupCount == 0 {
            try await Task.sleep(nanoseconds: 1_000_000)
        }
        XCTAssertEqual(backend.lookupCount, 1)
        await service.stop()
    }

    func testAPIBackendMapsNotFoundToNilAndBuildsLookupKey() async throws {
        let client = FakeAPIClient()
        let backend = APIStoreDetectionBackend(client: client)
        client.respond("/mobile/stores/by-beacon", with: .failure(.http(status: 404, message: nil)))
        let result = try await backend.store(for: identity)
        XCTAssertNil(result)
        XCTAssertEqual(client.callCount("/mobile/stores/by-beacon"), 1)

        client.respond("/mobile/stores/by-beacon", with: .failure(.http(status: 500, message: nil)))
        do {
            _ = try await backend.store(for: identity)
            XCTFail("Erwartet Fehler")
        } catch {
            XCTAssertEqual(error as? APIError, .http(status: 500, message: nil))
        }
    }

    func testAPIBackendDecodesDetectionUUIDs() async throws {
        let client = FakeAPIClient()
        client.respond(
            "/mobile/stores/beacon-identities",
            with: .success(Data(#"{"uuids": ["11111111-2222-3333-4444-555555555555"]}"#.utf8))
        )
        let uuids = try await APIStoreDetectionBackend(client: client).detectionUUIDs()
        XCTAssertEqual(uuids, [testBeaconUUID])
    }
}
