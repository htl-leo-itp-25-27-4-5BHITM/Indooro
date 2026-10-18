import Foundation
import IndooroModels
import IndooroNetworking
import IndooroPersistence

public struct LoadedLayout: Sendable {
    public enum Source: Sendable, Equatable {
        /// Antwort des Servers.
        case server
        /// Offline-Kopie (Zeitpunkt der Speicherung).
        case offlineCache(savedAt: Date)
        /// Letzte Version aus dem Layout-Verlauf des Servers.
        case history(layoutID: String)
        /// Im App-Bundle mitgelieferte Notfall-Layout-Datei.
        case bundle
    }

    public let layout: LayoutData
    public let source: Source
    /// `true`, wenn der Server selbst ein Ersatz-Layout geliefert hat (`fallback`-Flag).
    public let isServerFallback: Bool
    /// Filiale, zu der das Layout gehoert; `nil` beim globalen Layout.
    public let store: MobileStoreSummary?
    /// Grund, warum eine Rueckfallstufe benutzt wurde.
    public let reason: String?

    public init(
        layout: LayoutData,
        source: Source,
        isServerFallback: Bool = false,
        store: MobileStoreSummary? = nil,
        reason: String? = nil
    ) {
        self.layout = layout
        self.source = source
        self.isServerFallback = isServerFallback
        self.store = store
        self.reason = reason
    }
}

public enum LayoutRepositoryError: Error, Sendable, Equatable {
    case unavailable(reason: String)
}

/// Layout-Quelle mit der Kette Server -> Offline-Kopie -> Verlauf -> Bundle (Logik von `BeaconManager`).
/// Die Staleness-Pruefung (Generationen) bleibt beim Aufrufer: er bricht den `Task` ab, wenn ein neueres Laden beginnt.
public actor LayoutRepository {
    private let client: any APIClientProtocol
    private let cache: LayoutCacheStore
    private let bundleLayout: @Sendable () -> LayoutData?

    public init(
        client: any APIClientProtocol,
        cache: LayoutCacheStore = LayoutCacheStore(),
        bundleLayout: @escaping @Sendable () -> LayoutData?
    ) {
        self.client = client
        self.cache = cache
        self.bundleLayout = bundleLayout
    }

    // MARK: - Laden

    /// Aktuelles globales Layout. Bei Fehler: Cache der zuletzt gewaehlten Filiale, `default`-Cache,
    /// neueste Version aus dem Verlauf, zuletzt das Bundle-Layout.
    public func loadCurrent(lastSelectedStore: MobileStoreSummary? = nil) async -> LoadedLayout? {
        let reason: String
        switch await fetch(CurrentLayoutEndpoint()) {
        case .success(let data):
            if let layout = try? Self.decodeLayout(from: data) {
                cache.save(data, storeID: nil)
                return LoadedLayout(layout: layout, source: .server)
            }
            reason = "Server-Layout nicht lesbar"
        case .failure:
            reason = "Server momentan nicht erreichbar"
        }

        if let lastSelectedStore, let cached = offlineStoreLayout(for: lastSelectedStore) {
            return cached
        }
        if let cached = cache.load(storeID: nil), let layout = try? Self.decodeLayout(from: cached.data) {
            return LoadedLayout(layout: layout, source: .offlineCache(savedAt: cached.savedAt), reason: reason)
        }
        return await loadLatestHistoryVersion(reason: reason)
    }

    /// Layout einer Filiale. Bei Fehler die Offline-Kopie dieser Filiale, sonst `unavailable`.
    public func loadStoreLayout(for store: MobileStoreSummary) async throws -> LoadedLayout {
        let failure: String
        switch await fetch(StoreLayoutEndpoint(storeID: store.id)) {
        case .success(let data):
            if let decoded = try? Self.decodeMobileLayout(from: data) {
                cache.save(data, storeID: store.id.uuidString)
                return LoadedLayout(
                    layout: decoded.layout,
                    source: .server,
                    isServerFallback: decoded.isFallback,
                    store: store
                )
            }
            failure = "Store-Layout nicht lesbar"
        case .failure(let error):
            failure = String(describing: error)
        }
        if let cached = offlineStoreLayout(for: store) {
            return cached
        }
        throw LayoutRepositoryError.unavailable(reason: failure)
    }

    /// Eine gespeicherte Layout-Version; `nil`, wenn sie nicht mehr verfuegbar oder lesbar ist.
    public func loadVersion(_ layoutID: String) async -> LoadedLayout? {
        guard case .success(let data) = await fetch(LayoutVersionEndpoint(layoutID: layoutID)),
              let layout = try? Self.decodeLayout(from: data) else {
            return nil
        }
        return LoadedLayout(layout: layout, source: .server)
    }

    /// Verlauf der Layout-Versionen; leer bei Fehler.
    public func history(limit: Int) async -> [LayoutVersionSummary] {
        guard case .success(let data) = await fetch(LayoutHistoryEndpoint(limit: limit)),
              let versions = try? Self.decodeLayoutHistory(from: data) else {
            return []
        }
        return versions
    }

    /// Notfall: das mitgelieferte Layout.
    public func loadBundle(reason: String? = nil) -> LoadedLayout? {
        bundleLayout().map { LoadedLayout(layout: $0, source: .bundle, reason: reason) }
    }

    // MARK: - Rueckfallstufen

    private func offlineStoreLayout(for store: MobileStoreSummary) -> LoadedLayout? {
        guard let cached = cache.load(storeID: store.id.uuidString),
              let decoded = try? Self.decodeMobileLayout(from: cached.data) else {
            return nil
        }
        return LoadedLayout(
            layout: decoded.layout,
            source: .offlineCache(savedAt: cached.savedAt),
            isServerFallback: true,
            store: store
        )
    }

    private func loadLatestHistoryVersion(reason: String) async -> LoadedLayout? {
        guard let latest = await history(limit: 1).first,
              let version = await loadVersion(latest.layoutId) else {
            return loadBundle(reason: reason)
        }
        return LoadedLayout(layout: version.layout, source: .history(layoutID: latest.layoutId), reason: reason)
    }

    private func fetch<E: Endpoint>(_ endpoint: E) async -> Result<Data, APIError> where E.Response == RawJSON {
        await client.sendResult(endpoint).map(\.data)
    }

    // MARK: - Decodierung

    private struct Envelope: Decodable {
        let layout: LayoutData?
        let data: LayoutData?
        let current: LayoutData?
        let version: LayoutData?
    }

    private struct HistoryEnvelope: Decodable {
        let versions: [LayoutVersionSummary]?
        let history: [LayoutVersionSummary]?
        let items: [LayoutVersionSummary]?
        let data: [LayoutVersionSummary]?
    }

    enum DecodeError: Error { case decodingFailed }

    static func decodeLayout(from data: Data) throws -> LayoutData {
        let decoder = JSONCoding.makeDecoder()
        if let layout = try? decoder.decode(LayoutData.self, from: data) {
            return layout
        }
        if let envelope = try? decoder.decode(Envelope.self, from: data),
           let layout = envelope.layout ?? envelope.data ?? envelope.current ?? envelope.version {
            return layout
        }
        throw DecodeError.decodingFailed
    }

    /// Layout samt `fallback`-Flag aus `GET /mobile/stores/{id}/layout/current`; Roh-Layouts gelten als nicht fallback.
    static func decodeMobileLayout(from data: Data) throws -> (layout: LayoutData, isFallback: Bool) {
        if let response = try? JSONCoding.makeDecoder().decode(MobileLayoutResponse.self, from: data) {
            return (response.layout, response.fallback == true)
        }
        return (try decodeLayout(from: data), false)
    }

    static func decodeLayoutHistory(from data: Data) throws -> [LayoutVersionSummary] {
        let decoder = JSONCoding.makeDecoder()
        if let history = try? decoder.decode([LayoutVersionSummary].self, from: data) {
            return history
        }
        if let envelope = try? decoder.decode(HistoryEnvelope.self, from: data) {
            return envelope.versions ?? envelope.history ?? envelope.items ?? envelope.data ?? []
        }
        throw DecodeError.decodingFailed
    }
}
