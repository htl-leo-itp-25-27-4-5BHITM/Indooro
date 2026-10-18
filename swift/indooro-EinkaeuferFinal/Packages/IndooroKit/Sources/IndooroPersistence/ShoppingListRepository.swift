import Foundation
import IndooroModels

/// Persistenz der Einkaufslisten als versionierte Datei (modernize-ios-client-architecture, Entscheidung 7).
///
/// - Datei: `Application Support/ShoppingLists/lists.json`, Schema v2 (`ShoppingListSnapshot`).
/// - Laden (synchron im Initialisierer, damit der erste Frame den gespeicherten Zustand zeigt):
///   `lists.json` -> `lists.json.bak` -> einmalige Migration aus `UserDefaults` -> leerer Zustand.
///   Eine nicht lesbare Datei wird als `lists.corrupt-<timestamp>.json` aufbewahrt und nie ueberschrieben.
/// - Schreiben: Aenderungen werden um `debounce` (300 ms) verzoegert und zusammengefasst; `flush()` schreibt sofort.
///   Jeder Schreibvorgang geht ueber `lists.json.tmp`, sichert die bisherige Datei als `lists.json.bak` und
///   ersetzt `lists.json` atomar.
/// - Migration: Die alten Schluessel (`ShoppingListLegacyKeys`) werden nie beim Migrationsstart entfernt, sondern
///   erst, wenn `lists.json` in zwei aufeinanderfolgenden Starts erfolgreich geladen wurde (der Migrationsstart
///   zaehlt als erster, weil die geschriebene Datei zurueckgelesen wird). So verliert ein Rollback der App keine Listen.
public actor ShoppingListRepository {
    public typealias Sleeper = @Sendable (Duration) async throws -> Void
    public typealias FileWriter = @Sendable (Data, URL) throws -> Void

    /// Zustand beim Start (synchron geladen). Spaetere Aenderungen laufen ueber `setLists`/`setSession`.
    public nonisolated let initialSnapshot: ShoppingListSnapshot
    public nonisolated let loadReport: ShoppingListLoadReport

    private let paths: ShoppingListPaths?
    private let debounce: Duration
    private let sleeper: Sleeper
    private let writer: FileWriter
    private let now: @Sendable () -> Date

    private var snapshot: ShoppingListSnapshot
    private var isDirty = false
    private var listsGeneration = 0
    private var sessionGeneration = 0
    private var timerToken = 0
    private var timer: Task<Void, Never>?

    /// - Parameters:
    ///   - directory: Verzeichnis der Dateien. Standard: `<Application Support>/ShoppingLists`. Ist keines
    ///     ermittelbar, arbeitet das Repository nur im Speicher.
    ///   - defaults: Quelle der Migration (`UserDefaults.standard` in der App).
    ///   - debounce: Wartezeit vor dem Schreiben (300 ms).
    ///   - sleeper: ersetzt `Task.sleep` (Tests schalten die Zeit selbst weiter).
    ///   - writer: schreibt die Bytes in die temporaere Datei (Tests simulieren Schreibfehler).
    public init(
        directory: URL? = nil,
        defaults: UserDefaults = .standard,
        debounce: Duration = .milliseconds(300),
        sleeper: @escaping Sleeper = { try await Task.sleep(for: $0) },
        writer: @escaping FileWriter = ShoppingListRepository.durableWrite,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        let resolvedDirectory = directory ?? Self.defaultDirectory()
        let paths = resolvedDirectory.map(ShoppingListPaths.init(directory:))
        let loaded = Self.load(paths: paths, defaults: defaults, writer: writer, now: now())

        self.paths = paths
        self.debounce = debounce
        self.sleeper = sleeper
        self.writer = writer
        self.now = now
        self.snapshot = loaded.snapshot
        self.initialSnapshot = loaded.snapshot
        self.loadReport = loaded.report
    }

    /// Ersetzt Listen und Auswahl. `generation` steigt pro Aufrufer monoton; veraltete Aufrufe (die ueber getrennte
    /// `Task`s spaeter eintreffen) werden verworfen.
    public func setLists(_ lists: [ShoppingList], selectedListID: UUID?, generation: Int) {
        guard generation >= listsGeneration else { return }
        listsGeneration = generation
        guard snapshot.lists != lists || snapshot.selectedListID != selectedListID else { return }
        snapshot.lists = lists
        snapshot.selectedListID = selectedListID
        scheduleWrite()
    }

    /// Ersetzt aktive Tour-Liste und Routenmodus (bisher `shoppingSession.*`).
    public func setSession(activeTourListID: UUID?, routeMode: ShoppingRouteMode, generation: Int) {
        guard generation >= sessionGeneration else { return }
        sessionGeneration = generation
        guard snapshot.activeTourListID != activeTourListID || snapshot.routeMode != routeMode else { return }
        snapshot.activeTourListID = activeTourListID
        snapshot.routeMode = routeMode
        scheduleWrite()
    }

    /// Schreibt ausstehende Aenderungen sofort (App geht in den Hintergrund, Tests).
    public func flush() {
        timer?.cancel()
        timer = nil
        timerToken += 1
        writeIfDirty()
    }

    // MARK: - Schreiben

    private func scheduleWrite() {
        isDirty = true
        timer?.cancel()
        timerToken += 1
        let token = timerToken
        let sleeper = self.sleeper
        let debounce = self.debounce
        timer = Task {
            do {
                try await sleeper(debounce)
            } catch {
                return
            }
            self.timerFired(token)
        }
    }

    private func timerFired(_ token: Int) {
        guard token == timerToken else { return }
        timer = nil
        writeIfDirty()
    }

    private func writeIfDirty() {
        guard isDirty else { return }
        guard let paths else {
            isDirty = false
            return
        }
        do {
            try ShoppingListFiles.write(snapshot, to: paths, writer: writer, now: now())
            isDirty = false
        } catch {
            // Die vorherige Datei bleibt erhalten; der Zustand bleibt "dirty" und wird beim naechsten Zeitpunkt erneut versucht.
            PersistenceLog.logger.error("ShoppingLists: Speichern fehlgeschlagen: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Schreibt mit `FileHandle` und `synchronize()`, damit die Bytes vor dem Ersetzen auf dem Datentraeger liegen.
    public static func durableWrite(_ data: Data, to url: URL) throws {
        guard FileManager.default.createFile(atPath: url.path, contents: nil) else {
            throw CocoaError(.fileWriteUnknown)
        }
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try handle.write(contentsOf: data)
        try handle.synchronize()
    }

    // MARK: - Laden

    private static func defaultDirectory() -> URL? {
        guard let support = try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) else {
            return nil
        }
        return support.appendingPathComponent("ShoppingLists", isDirectory: true)
    }

    private struct Loaded {
        var snapshot: ShoppingListSnapshot
        var report: ShoppingListLoadReport
    }

    /// Alter Blob von `ShoppingListManager.persist()` (`shoppingListStore.v1`), unveraendert dekodiert.
    private struct LegacyShoppingListStore: Decodable {
        var lists: [ShoppingList]
        var selectedListID: UUID?
    }

    private static func load(
        paths: ShoppingListPaths?,
        defaults: UserDefaults,
        writer: FileWriter,
        now: Date
    ) -> Loaded {
        var quarantined: [String] = []

        guard let paths else {
            // Ohne Verzeichnis nur Migration im Speicher; es wird nichts geschrieben und nichts entfernt.
            let migrated = readLegacy(defaults: defaults)
            return Loaded(
                snapshot: migrated.snapshot ?? ShoppingListSnapshot(),
                report: ShoppingListLoadReport(source: migrated.snapshot == nil ? .fresh : .userDefaultsMigration)
            )
        }

        try? FileManager.default.createDirectory(at: paths.directory, withIntermediateDirectories: true)

        // 1. lists.json
        switch ShoppingListFiles.read(paths.primary) {
        case .valid(let snapshot):
            let removed = confirmLoad(defaults: defaults, counted: true)
            return Loaded(snapshot: snapshot, report: ShoppingListLoadReport(source: .file, legacyKeysRemoved: removed))
        case .invalid:
            if let name = ShoppingListFiles.quarantine(paths.primary, in: paths.directory, now: now) {
                quarantined.append(name)
            }
        case .missing:
            break
        }

        // 2. lists.json.bak
        switch ShoppingListFiles.read(paths.backup) {
        case .valid(let snapshot):
            // Die Sicherung bleibt unveraendert liegen; lists.json wird aus ihr neu angelegt.
            try? ShoppingListFiles.write(snapshot, to: paths, writer: writer, now: now)
            confirmLoad(defaults: defaults, counted: false)
            return Loaded(snapshot: snapshot, report: ShoppingListLoadReport(source: .backup, quarantinedFileNames: quarantined))
        case .invalid:
            if let name = ShoppingListFiles.quarantine(paths.backup, in: paths.directory, now: now) {
                quarantined.append(name)
            }
        case .missing:
            break
        }

        // 3. Migration aus UserDefaults
        let legacy = readLegacy(defaults: defaults)
        if let unreadable = legacy.unreadableStoreBlob,
           let name = ShoppingListFiles.preserve(unreadable, in: paths.directory, now: now) {
            quarantined.append(name)
        }
        if let migrated = legacy.snapshot {
            var persisted = false
            do {
                try ShoppingListFiles.write(migrated, to: paths, writer: writer, now: now)
                if case .valid(let readBack) = ShoppingListFiles.read(paths.primary), readBack == migrated {
                    persisted = true
                }
            } catch {
                PersistenceLog.logger.error("ShoppingLists: Migration konnte nicht geschrieben werden: \(error.localizedDescription, privacy: .public)")
            }
            if persisted {
                // Der Migrationsstart ist die erste bestaetigte Ladung der neuen Datei.
                defaults.set(1, forKey: ShoppingListLegacyKeys.confirmedLoadCount)
            }
            return Loaded(
                snapshot: migrated,
                report: ShoppingListLoadReport(source: .userDefaultsMigration, quarantinedFileNames: quarantined)
            )
        }

        // 4. Leerer Zustand (Neuinstallation). Aktive Tour/Routenmodus aus alten Schluesseln bleiben moeglich.
        confirmLoad(defaults: defaults, counted: false)
        return Loaded(
            snapshot: legacy.sessionOnlySnapshot ?? ShoppingListSnapshot(),
            report: ShoppingListLoadReport(source: .fresh, quarantinedFileNames: quarantined)
        )
    }

    private struct LegacyRead {
        /// Vollstaendiger Zustand, wenn mindestens einer der drei Schluessel Daten enthaelt und der Blob lesbar ist.
        var snapshot: ShoppingListSnapshot?
        var unreadableStoreBlob: Data?
        var sessionOnlySnapshot: ShoppingListSnapshot?
    }

    private static func readLegacy(defaults: UserDefaults) -> LegacyRead {
        let blob = defaults.data(forKey: ShoppingListLegacyKeys.store)
        let activeID = defaults.string(forKey: ShoppingListLegacyKeys.activeListID).flatMap(UUID.init(uuidString:))
        let routeMode = defaults.string(forKey: ShoppingListLegacyKeys.routeMode).flatMap(ShoppingRouteMode.init(rawValue:))

        let session = ShoppingListSnapshot(activeTourListID: activeID, routeMode: routeMode ?? .optimized)
        let hasSession = activeID != nil || routeMode != nil

        if let blob {
            guard let store = try? JSONDecoder().decode(LegacyShoppingListStore.self, from: blob) else {
                return LegacyRead(snapshot: nil, unreadableStoreBlob: blob, sessionOnlySnapshot: hasSession ? session : nil)
            }
            return LegacyRead(
                snapshot: ShoppingListSnapshot(
                    lists: store.lists,
                    selectedListID: store.selectedListID,
                    activeTourListID: activeID,
                    routeMode: routeMode ?? .optimized
                ),
                unreadableStoreBlob: nil,
                sessionOnlySnapshot: nil
            )
        }

        // Nur Sitzungsschluessel ohne Listen: kein Migrationsfall, aber der Zustand bleibt wie bisher erhalten.
        return LegacyRead(snapshot: nil, unreadableStoreBlob: nil, sessionOnlySnapshot: hasSession ? session : nil)
    }

    /// Zaehlt einen erfolgreichen Start mit `lists.json` und entfernt nach dem zweiten die alten Schluessel.
    /// Liefert `true`, wenn die Schluessel in diesem Aufruf entfernt wurden.
    @discardableResult
    private static func confirmLoad(defaults: UserDefaults, counted: Bool) -> Bool {
        guard counted else {
            // Start ohne erfolgreiche Ladung der Hauptdatei: die Folge "aufeinanderfolgend" beginnt von vorn.
            if defaults.object(forKey: ShoppingListLegacyKeys.confirmedLoadCount) != nil {
                defaults.removeObject(forKey: ShoppingListLegacyKeys.confirmedLoadCount)
            }
            return false
        }

        let hasLegacyKeys = ShoppingListLegacyKeys.all.contains { defaults.object(forKey: $0) != nil }
        guard hasLegacyKeys else {
            return false
        }

        let count = defaults.integer(forKey: ShoppingListLegacyKeys.confirmedLoadCount) + 1
        if count >= 2 {
            for key in ShoppingListLegacyKeys.all {
                defaults.removeObject(forKey: key)
            }
            defaults.removeObject(forKey: ShoppingListLegacyKeys.confirmedLoadCount)
            return true
        }
        defaults.set(count, forKey: ShoppingListLegacyKeys.confirmedLoadCount)
        return false
    }
}
