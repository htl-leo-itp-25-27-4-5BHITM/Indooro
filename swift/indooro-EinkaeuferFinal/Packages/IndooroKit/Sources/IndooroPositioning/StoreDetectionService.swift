import Foundation
import IndooroModels
import IndooroNetworking

/// Backend der Store-Erkennung.
public protocol StoreDetectionBackend: Sendable {
    /// Filiale zu einem Beacon; `nil`, wenn das Backend keine kennt (HTTP 404).
    func store(for identity: BeaconIdentity) async throws -> StoreByBeaconResponse?
    /// UUIDs, die im Ranging zusaetzlich beobachtet werden muessen.
    func detectionUUIDs() async throws -> Set<UUID>
}

/// Backend ueber den `APIClient` (`GET /mobile/stores/by-beacon` und `/mobile/stores/beacon-identities`).
public struct APIStoreDetectionBackend: StoreDetectionBackend {
    private let client: any APIClientProtocol

    public init(client: any APIClientProtocol) {
        self.client = client
    }

    public func store(for identity: BeaconIdentity) async throws -> StoreByBeaconResponse? {
        let endpoint = StoreByBeaconEndpoint(
            uuid: identity.uuidLookupKey,
            major: Int(identity.major),
            minor: Int(identity.minor)
        ).asRaw
        do {
            let raw = try await client.send(endpoint)
            return try JSONCoding.makeDecoder().decode(StoreByBeaconResponse.self, from: raw.data)
        } catch let error as APIError {
            if case .http(status: 404, message: _) = error { return nil }
            throw error
        }
    }

    public func detectionUUIDs() async throws -> Set<UUID> {
        let raw = try await client.send(BeaconIdentitiesEndpoint().asRaw)
        let catalog = try JSONCoding.makeDecoder().decode(StoreDetectionBeaconCatalog.self, from: raw.data)
        return Set(catalog.uuidStrings.compactMap { BeaconUUIDNormalizer.uuid(from: $0) })
    }
}

public enum StoreDetectionEvent: Sendable {
    /// Eine Filiale wurde erkannt. Der Aufrufer meldet mit `markActive` zurueck, dass er sie uebernimmt.
    case detected(StoreByBeaconResponse, identityKey: String)
    /// Das Backend kennt den Beacon nicht.
    case notFound(identityKey: String)
    /// Die UUID-Menge der Store-Erkennung hat sich geaendert (Ranging-Constraints neu bauen).
    case detectionUUIDsChanged(Set<UUID>)
}

/// Store-Erkennung (Logik von `BeaconManager.handleDetectedStoreBeacon` und
/// `refreshStoreDetectionBeaconsIfNeeded`): RSSI-Untergrenze, Entdoppelung laufender und aktiver Lookups,
/// Wartezeit nach einem Fehlschlag und zeitlich begrenzte Aktualisierung des UUID-Katalogs.
public actor StoreDetectionService {
    public nonisolated let events: AsyncStream<StoreDetectionEvent>

    private let continuation: AsyncStream<StoreDetectionEvent>.Continuation
    private let backend: any StoreDetectionBackend
    private let clock: any PositioningClock
    private let minimumRSSI: Int
    private let failureCooldown: TimeInterval
    private let identityRefreshInterval: TimeInterval

    private var pendingKey: String?
    private var activeKey: String?
    private var lastFailedKey: String?
    private var lastFailedAt: TimeInterval?
    private var isLoadingIdentities = false
    private var lastIdentityRefreshAt: TimeInterval?
    private var knownUUIDs: Set<UUID> = []
    private var consumer: Task<Void, Never>?

    public init(
        backend: any StoreDetectionBackend,
        clock: any PositioningClock = SystemPositioningClock(),
        minimumRSSI: Int = -95,
        failureCooldown: TimeInterval = 15,
        identityRefreshInterval: TimeInterval = 60
    ) {
        let (stream, continuation) = AsyncStream<StoreDetectionEvent>.makeStream(bufferingPolicy: .bufferingNewest(16))
        events = stream
        self.continuation = continuation
        self.backend = backend
        self.clock = clock
        self.minimumRSSI = minimumRSSI
        self.failureCooldown = failureCooldown
        self.identityRefreshInterval = identityRefreshInterval
    }

    deinit {
        continuation.finish()
    }

    /// Liest die Samples eines Funkmoduls, bis `stop()` aufgerufen wird.
    public func start(samples: AsyncStream<BeaconSample>) {
        consumer?.cancel()
        consumer = Task { [weak self] in
            for await sample in samples {
                await self?.observe(sample)
            }
        }
    }

    public func stop() {
        consumer?.cancel()
        consumer = nil
    }

    /// Meldet, dass die erkannte Filiale uebernommen wurde; weitere Samples desselben Beacons loesen keinen Lookup aus.
    public func markActive(identityKey: String) {
        activeKey = identityKey
        lastFailedKey = nil
        lastFailedAt = nil
    }

    /// Die erkannte Filiale wurde verworfen (zum Beispiel Layout nicht ladbar).
    public func clearActive(failedIdentityKey: String? = nil) {
        activeKey = nil
        if let failedIdentityKey {
            lastFailedKey = failedIdentityKey
            lastFailedAt = clock.now()
        }
    }

    /// Verarbeitet ein Sample: Ranging nutzt den gemessenen RSSI, bei RSSI 0 gilt die Untergrenze.
    public func observe(_ sample: BeaconSample) async {
        guard let identity = sample.identity else { return }
        let rssi: Int
        switch sample.source {
        case .ranging: rssi = sample.rssi < 0 ? sample.rssi : minimumRSSI
        case .advertisement: rssi = sample.rssi
        }
        await lookup(identity, rssi: rssi)
        await refreshIdentitiesIfNeeded()
    }

    /// Lookup fuer einen erkannten Beacon.
    public func lookup(_ identity: BeaconIdentity, rssi: Int) async {
        guard rssi >= minimumRSSI else { return }
        let key = identity.uuidLookupKey
        if key == pendingKey || key == activeKey { return }
        let now = clock.now()
        if key == lastFailedKey, let lastFailedAt, now - lastFailedAt < failureCooldown { return }

        pendingKey = key
        defer { if pendingKey == key { pendingKey = nil } }
        do {
            if let response = try await backend.store(for: identity) {
                continuation.yield(.detected(response, identityKey: key))
            } else {
                lastFailedKey = key
                lastFailedAt = clock.now()
                continuation.yield(.notFound(identityKey: key))
            }
        } catch {
            // Netzwerk- oder Decodierfehler: kein Cooldown, der naechste Sample versucht es erneut.
        }
    }

    /// Laedt den UUID-Katalog, hoechstens einmal je `identityRefreshInterval` (oder sofort mit `force`).
    public func refreshIdentitiesIfNeeded(force: Bool = false) async {
        guard !isLoadingIdentities else { return }
        let now = clock.now()
        if !force, let lastIdentityRefreshAt, now - lastIdentityRefreshAt < identityRefreshInterval { return }

        isLoadingIdentities = true
        lastIdentityRefreshAt = now
        defer { isLoadingIdentities = false }
        guard let uuids = try? await backend.detectionUUIDs(), !uuids.isEmpty else { return }
        if uuids != knownUUIDs {
            knownUUIDs = uuids
            continuation.yield(.detectionUUIDsChanged(uuids))
        }
    }
}
