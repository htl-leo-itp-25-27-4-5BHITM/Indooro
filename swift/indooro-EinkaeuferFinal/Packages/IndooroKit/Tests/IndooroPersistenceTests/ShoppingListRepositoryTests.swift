import Foundation
import IndooroModels
import XCTest
@testable import IndooroPersistence

/// Task 8.3: Neuinstallation, Migration des v1-Formats, beschaedigte Datei, Backup-Wiederherstellung,
/// Entfernung der alten Schluessel nach zwei Starts, atomares Schreiben und Debounce.
final class ShoppingListRepositoryTests: PersistenceTestCase {

    // MARK: - Neuinstallation

    func testFreshInstallStartsEmptyAndWritesNothingUntilFirstChange() async throws {
        let repository = makeRepository()

        XCTAssertEqual(repository.loadReport.source, .fresh)
        XCTAssertEqual(repository.initialSnapshot, ShoppingListSnapshot())
        XCTAssertEqual(repository.initialSnapshot.schemaVersion, 2)
        XCTAssertFalse(FileManager.default.fileExists(atPath: primaryURL.path))

        let list = sampleList("Meine Einkaufsliste")
        await repository.setLists([list], selectedListID: list.id, generation: 1)
        await repository.flush()

        let stored = try decodeFile(primaryURL)
        XCTAssertEqual(stored.schemaVersion, 2)
        XCTAssertEqual(stored.lists, [list])
        XCTAssertEqual(stored.selectedListID, list.id)
        XCTAssertNil(stored.activeTourListID)
        XCTAssertEqual(stored.routeMode, .optimized)
        XCTAssertFalse(FileManager.default.fileExists(atPath: temporaryURL.path))
    }

    func testFileUsesDocumentedSchemaV2Keys() async throws {
        let repository = makeRepository()
        let list = sampleList("Wocheneinkauf")
        await repository.setLists([list], selectedListID: list.id, generation: 1)
        await repository.setSession(activeTourListID: list.id, routeMode: .listOrder, generation: 1)
        await repository.flush()

        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: primaryURL)) as? [String: Any])
        XCTAssertEqual(Set(object.keys), ["schemaVersion", "selectedListID", "activeTourListID", "routeMode", "lists"])
        XCTAssertEqual(object["schemaVersion"] as? Int, 2)
        XCTAssertEqual(object["routeMode"] as? String, "listOrder")
        XCTAssertEqual(object["selectedListID"] as? String, list.id.uuidString)
    }

    func testRoundTripReloadsWhatWasWritten() async throws {
        let first = makeRepository()
        let list = sampleList("Liste")
        await first.setLists([list], selectedListID: list.id, generation: 1)
        await first.setSession(activeTourListID: list.id, routeMode: .listOrder, generation: 1)
        await first.flush()

        let second = makeRepository()
        XCTAssertEqual(second.loadReport.source, .file)
        XCTAssertEqual(second.initialSnapshot.lists, [list])
        XCTAssertEqual(second.initialSnapshot.selectedListID, list.id)
        XCTAssertEqual(second.initialSnapshot.activeTourListID, list.id)
        XCTAssertEqual(second.initialSnapshot.routeMode, .listOrder)
    }

    // MARK: - Migration aus UserDefaults (v1)

    /// Die Fixture `shopping-list-v1.json` ist eine Liste im Altformat; der Blob im Store hat die Form
    /// `{"lists":[<Liste>],"selectedListID":"<id>"}` wie `ShoppingListManager.persist()` ihn schreibt.
    private func legacyBlob(fromFixture name: String = "shopping-list-v1.json") throws -> (blob: Data, listID: UUID) {
        let listData = try PersistenceFixtures.data(name)
        let id = try JSONDecoder().decode(ShoppingList.self, from: listData).id
        var blob = Data("{\"lists\":[".utf8)
        blob.append(listData)
        blob.append(Data("],\"selectedListID\":\"\(id.uuidString)\"}".utf8))
        return (blob, id)
    }

    func testV1FixtureMigratesWithoutChangeAndWritesSchemaV2File() async throws {
        let (blob, listID) = try legacyBlob()
        defaults.set(blob, forKey: ShoppingListLegacyKeys.store)
        defaults.set(listID.uuidString, forKey: ShoppingListLegacyKeys.activeListID)
        defaults.set("listOrder", forKey: ShoppingListLegacyKeys.routeMode)

        // Referenz: genau die Dekodierung des bisherigen `ShoppingListManager.load()`.
        let legacy = try JSONDecoder().decode(LegacyShoppingListStore.self, from: blob)

        let repository = makeRepository()

        XCTAssertEqual(repository.loadReport.source, .userDefaultsMigration)
        XCTAssertEqual(repository.initialSnapshot.lists, legacy.lists)
        XCTAssertEqual(repository.initialSnapshot.selectedListID, legacy.selectedListID)
        XCTAssertEqual(repository.initialSnapshot.activeTourListID, listID)
        XCTAssertEqual(repository.initialSnapshot.routeMode, .listOrder)

        let list = try XCTUnwrap(repository.initialSnapshot.lists.first)
        XCTAssertEqual(repository.initialSnapshot.lists.count, 1)
        XCTAssertEqual(list.name, "Wocheneinkauf")
        XCTAssertEqual(list.items.map(\.name), ["Naturpur Bio-Milch 1L", "Gala Aepfel lose", "Haferflocken (frei erfasst)"])
        XCTAssertEqual(list.items.map(\.quantity), [2, 1, 1])
        XCTAssertEqual(list.items.map(\.status), [.open, .done, .missing])
        XCTAssertEqual(list.items[1].note, "rote, nicht zu weich")
        XCTAssertEqual(list.items[0].addedAt.timeIntervalSinceReferenceDate, 792_115_200.5)
        XCTAssertEqual(list.updatedAt.timeIntervalSinceReferenceDate, 792_118_800.0)

        // lists.json ist geschrieben und liefert dieselben Daten; der alte Blob bleibt unveraendert liegen.
        let stored = try decodeFile(primaryURL)
        XCTAssertEqual(stored.lists, legacy.lists)
        XCTAssertEqual(stored.schemaVersion, 2)
        XCTAssertEqual(defaults.data(forKey: ShoppingListLegacyKeys.store), blob)
    }

    func testMigrationIsLosslessForAllItemFieldsAndKeepsArchivedLists() async throws {
        let product = Product(id: 7, name: "Hafermilch", price: 2.49, layoutCode: "520/3/1/1")
        var recipeList = ShoppingList(name: "Rezeptliste")
        recipeList.items = [
            ShoppingListItem(
                product: product,
                quantity: 3,
                note: "Barista",
                sortOrder: 4,
                sourceRecipeId: UUID(),
                sourceRecipeName: "Porridge",
                ingredientName: "Hafermilch",
                ingredientQuantity: "500",
                ingredientUnit: "ml",
                mappingConfidence: 0.83,
                manuallyConfirmed: true,
                addedFromUpsell: true
            ),
            ShoppingListItem(
                freeIngredientName: "Zimt",
                sourceRecipeId: UUID(),
                sourceRecipeName: "Porridge",
                ingredientQuantity: "1",
                ingredientUnit: "Prise"
            ),
        ]
        var archived = sampleList("Archiviert")
        archived.isArchived = true
        let fixtureList = try JSONDecoder().decode(ShoppingList.self, from: PersistenceFixtures.data("shopping-list-v1.json"))
        let original = [recipeList, archived, fixtureList]
        try seedLegacyDefaults(lists: original, selectedListID: recipeList.id, activeListID: recipeList.id, routeMode: "optimized")

        let repository = makeRepository()

        XCTAssertEqual(repository.loadReport.source, .userDefaultsMigration)
        XCTAssertEqual(repository.initialSnapshot.lists, original)
        XCTAssertEqual(repository.initialSnapshot.lists[0].items[0].mappingConfidence, 0.83)
        XCTAssertEqual(repository.initialSnapshot.lists[0].items[0].addedFromUpsell, true)
        XCTAssertEqual(repository.initialSnapshot.selectedListID, recipeList.id)
        XCTAssertEqual(repository.initialSnapshot.activeTourListID, recipeList.id)
        XCTAssertEqual(repository.initialSnapshot.routeMode, .optimized)

        // Auch der Weg ueber die Datei (neues Repository) ist verlustfrei.
        let reloaded = makeRepository()
        XCTAssertEqual(reloaded.loadReport.source, .file)
        XCTAssertEqual(reloaded.initialSnapshot.lists, original)

        // Die Listen-Bytes sind identisch zur bisherigen Kodierung.
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        XCTAssertEqual(
            try encoder.encode(reloaded.initialSnapshot.lists),
            try encoder.encode(original)
        )
    }

    func testMigrationDefaultsMatchPreviousBehaviourForMissingOrInvalidSessionKeys() async throws {
        let list = sampleList("Liste")
        try seedLegacyDefaults(lists: [list], selectedListID: nil, activeListID: nil, routeMode: "gibtsNicht")
        defaults.set("kein-uuid", forKey: ShoppingListLegacyKeys.activeListID)

        let repository = makeRepository()

        XCTAssertEqual(repository.initialSnapshot.lists, [list])
        XCTAssertNil(repository.initialSnapshot.selectedListID)
        XCTAssertNil(repository.initialSnapshot.activeTourListID)
        XCTAssertEqual(repository.initialSnapshot.routeMode, .optimized)
    }

    func testSessionKeysWithoutListBlobAreKeptLikeBefore() async throws {
        let id = UUID()
        defaults.set(id.uuidString, forKey: ShoppingListLegacyKeys.activeListID)
        defaults.set("listOrder", forKey: ShoppingListLegacyKeys.routeMode)

        let repository = makeRepository()

        XCTAssertEqual(repository.loadReport.source, .fresh)
        XCTAssertTrue(repository.initialSnapshot.lists.isEmpty)
        XCTAssertEqual(repository.initialSnapshot.activeTourListID, id)
        XCTAssertEqual(repository.initialSnapshot.routeMode, .listOrder)
    }

    func testUnreadableLegacyBlobIsPreservedAndNotSilentlyDiscarded() async throws {
        let garbage = Data("{\"lists\": [kaputt".utf8)
        defaults.set(garbage, forKey: ShoppingListLegacyKeys.store)

        let repository = makeRepository()

        XCTAssertEqual(repository.loadReport.source, .fresh)
        XCTAssertTrue(repository.initialSnapshot.lists.isEmpty)
        let corrupt = corruptFileNames()
        XCTAssertEqual(corrupt.count, 1)
        XCTAssertEqual(repository.loadReport.quarantinedFileNames, corrupt)
        XCTAssertEqual(try Data(contentsOf: directory.appendingPathComponent(corrupt[0])), garbage)
        XCTAssertEqual(defaults.data(forKey: ShoppingListLegacyKeys.store), garbage)
    }

    func testFileWinsOverUserDefaultsAfterMigration() async throws {
        let (blob, _) = try legacyBlob()
        defaults.set(blob, forKey: ShoppingListLegacyKeys.store)
        _ = makeRepository() // Migrationsstart

        let changed = makeRepository()
        let list = sampleList("Nur in der Datei")
        await changed.setLists([list], selectedListID: list.id, generation: 1)
        await changed.flush()

        let third = makeRepository()
        XCTAssertEqual(third.loadReport.source, .file)
        XCTAssertEqual(third.initialSnapshot.lists, [list])
    }

    // MARK: - Entfernung der alten Schluessel (zwei Starts)

    func testLegacyKeysAreRemovedOnlyAfterSecondSuccessfulLaunch() async throws {
        let (blob, listID) = try legacyBlob()
        defaults.set(blob, forKey: ShoppingListLegacyKeys.store)
        defaults.set(listID.uuidString, forKey: ShoppingListLegacyKeys.activeListID)
        defaults.set("listOrder", forKey: ShoppingListLegacyKeys.routeMode)

        // Start 1: Migration. Alle Schluessel bleiben (Rollback der App verliert keine Listen).
        let first = makeRepository()
        XCTAssertEqual(first.loadReport.source, .userDefaultsMigration)
        XCTAssertFalse(first.loadReport.legacyKeysRemoved)
        for key in ShoppingListLegacyKeys.all {
            XCTAssertNotNil(defaults.object(forKey: key), "\(key) muss nach dem ersten Start noch existieren")
        }

        // Start 2: lists.json geladen -> zweite erfolgreiche Ladung -> Schluessel entfernt.
        let second = makeRepository()
        XCTAssertEqual(second.loadReport.source, .file)
        XCTAssertTrue(second.loadReport.legacyKeysRemoved)
        for key in ShoppingListLegacyKeys.all + [ShoppingListLegacyKeys.confirmedLoadCount] {
            XCTAssertNil(defaults.object(forKey: key), "\(key) muss nach dem zweiten Start entfernt sein")
        }
        XCTAssertEqual(second.initialSnapshot.lists.first?.name, "Wocheneinkauf")
        XCTAssertEqual(second.initialSnapshot.activeTourListID, listID)
        XCTAssertEqual(second.initialSnapshot.routeMode, .listOrder)

        // Start 3: die Daten kommen weiterhin aus der Datei.
        let third = makeRepository()
        XCTAssertEqual(third.loadReport.source, .file)
        XCTAssertFalse(third.loadReport.legacyKeysRemoved)
        XCTAssertEqual(third.initialSnapshot, second.initialSnapshot)
    }

    func testBackupRecoveryDoesNotCountAsConfirmedLoad() async throws {
        let a = sampleList("A")
        let b = sampleList("B")
        let editing = makeRepository()
        await editing.setLists([a], selectedListID: a.id, generation: 1)
        await editing.flush()
        await editing.setLists([b], selectedListID: b.id, generation: 2)
        await editing.flush()

        // Zustand "nach dem Migrationsstart": alter Blob vorhanden, erste Ladung bestaetigt.
        let (blob, _) = try legacyBlob()
        defaults.set(blob, forKey: ShoppingListLegacyKeys.store)
        defaults.set(1, forKey: ShoppingListLegacyKeys.confirmedLoadCount)
        try Data("kaputt".utf8).write(to: primaryURL)

        let recovered = makeRepository()

        XCTAssertEqual(recovered.loadReport.source, .backup)
        XCTAssertEqual(recovered.initialSnapshot.lists, [a])
        XCTAssertFalse(recovered.loadReport.legacyKeysRemoved)
        XCTAssertNotNil(defaults.object(forKey: ShoppingListLegacyKeys.store), "Der alte Blob bleibt nach einer Wiederherstellung erhalten")
        XCTAssertNil(defaults.object(forKey: ShoppingListLegacyKeys.confirmedLoadCount), "Die Folge aufeinanderfolgender Ladungen beginnt neu")
    }

    func testNoLegacyKeysMeansNothingToRemove() async throws {
        _ = makeRepository()
        let second = makeRepository()
        XCTAssertFalse(second.loadReport.legacyKeysRemoved)
        XCTAssertNil(defaults.object(forKey: ShoppingListLegacyKeys.confirmedLoadCount))
    }

    func testFailedMigrationWriteKeepsKeysAndRetriesNextLaunch() async throws {
        let (blob, _) = try legacyBlob()
        defaults.set(blob, forKey: ShoppingListLegacyKeys.store)
        let probe = WriteProbe()
        probe.mode = .failImmediately

        let failing = makeRepository(writer: probe.writer)
        XCTAssertEqual(failing.loadReport.source, .userDefaultsMigration)
        XCTAssertEqual(failing.initialSnapshot.lists.count, 1, "Die Listen sind trotz Schreibfehler sichtbar")
        XCTAssertFalse(FileManager.default.fileExists(atPath: primaryURL.path))
        XCTAssertNil(defaults.object(forKey: ShoppingListLegacyKeys.confirmedLoadCount))

        // Naechster Start mit funktionierendem Schreiben migriert erneut; die Schluessel waren nie weg.
        let retry = makeRepository()
        XCTAssertEqual(retry.loadReport.source, .userDefaultsMigration)
        XCTAssertEqual(retry.initialSnapshot.lists, failing.initialSnapshot.lists)
        XCTAssertTrue(FileManager.default.fileExists(atPath: primaryURL.path))
    }

    // MARK: - Beschaedigte Datei und Backup

    func testCorruptFileIsQuarantinedAndBackupIsUsed() async throws {
        let first = sampleList("Erste")
        let second = sampleList("Zweite")
        let repository = makeRepository()
        await repository.setLists([first], selectedListID: first.id, generation: 1)
        await repository.flush()
        await repository.setLists([first, second], selectedListID: second.id, generation: 2)
        await repository.flush()

        // lists.json.bak hält den vorherigen Stand.
        XCTAssertEqual(try decodeFile(backupURL).lists, [first])
        XCTAssertEqual(try decodeFile(primaryURL).lists, [first, second])

        let garbage = Data("{ das ist kein json".utf8)
        try garbage.write(to: primaryURL)

        let recovered = makeRepository()

        XCTAssertEqual(recovered.loadReport.source, .backup)
        XCTAssertEqual(recovered.initialSnapshot.lists, [first])
        let corrupt = corruptFileNames()
        XCTAssertEqual(corrupt.count, 1)
        XCTAssertEqual(recovered.loadReport.quarantinedFileNames, corrupt)
        XCTAssertTrue(corrupt[0].hasPrefix("lists.corrupt-"))
        XCTAssertEqual(try Data(contentsOf: directory.appendingPathComponent(corrupt[0])), garbage)
        // lists.json ist aus dem Backup wiederhergestellt, das Backup bleibt unveraendert.
        XCTAssertEqual(try decodeFile(primaryURL).lists, [first])
        XCTAssertEqual(try decodeFile(backupURL).lists, [first])
    }

    func testCorruptFileWithoutBackupIsKeptAndNeverOverwrittenByDefaultList() async throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let garbage = Data("[1, 2".utf8)
        try garbage.write(to: primaryURL)

        let repository = makeRepository()

        XCTAssertEqual(repository.loadReport.source, .fresh)
        XCTAssertTrue(repository.initialSnapshot.lists.isEmpty)
        let corrupt = corruptFileNames()
        XCTAssertEqual(corrupt.count, 1)
        XCTAssertEqual(try Data(contentsOf: directory.appendingPathComponent(corrupt[0])), garbage)

        // Auch ein anschliessendes Speichern der Standardliste ueberschreibt die unlesbaren Daten nicht.
        let list = sampleList("Meine Einkaufsliste")
        await repository.setLists([list], selectedListID: list.id, generation: 1)
        await repository.flush()
        XCTAssertEqual(try Data(contentsOf: directory.appendingPathComponent(corrupt[0])), garbage)
        XCTAssertEqual(try decodeFile(primaryURL).lists, [list])
    }

    func testFileWithOtherSchemaVersionIsTreatedAsUnreadableAndKept() async throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let future = Data("{\"schemaVersion\":3,\"lists\":[],\"routeMode\":\"optimized\"}".utf8)
        try future.write(to: primaryURL)

        let repository = makeRepository()

        XCTAssertEqual(repository.loadReport.source, .fresh)
        let corrupt = corruptFileNames()
        XCTAssertEqual(corrupt.count, 1)
        XCTAssertEqual(try Data(contentsOf: directory.appendingPathComponent(corrupt[0])), future)
    }

    func testCorruptFileAndCorruptBackupFallBackToMigrationKeepingBothFiles() async throws {
        let (blob, _) = try legacyBlob()
        defaults.set(blob, forKey: ShoppingListLegacyKeys.store)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Data("a".utf8).write(to: primaryURL)
        try Data("b".utf8).write(to: backupURL)

        let repository = makeRepository()

        XCTAssertEqual(repository.loadReport.source, .userDefaultsMigration)
        XCTAssertEqual(repository.initialSnapshot.lists.first?.name, "Wocheneinkauf")
        let contents = try corruptFileNames().map { try String(contentsOf: directory.appendingPathComponent($0), encoding: .utf8) }
        XCTAssertEqual(Set(contents), ["a", "b"])
    }

    func testBackupHoldsPreviousVersionAfterEachWrite() async throws {
        let repository = makeRepository()
        let a = sampleList("A")
        let b = sampleList("B")
        let c = sampleList("C")

        await repository.setLists([a], selectedListID: a.id, generation: 1)
        await repository.flush()
        XCTAssertFalse(FileManager.default.fileExists(atPath: backupURL.path), "Erster Schreibvorgang hat nichts zu sichern")

        await repository.setLists([b], selectedListID: b.id, generation: 2)
        await repository.flush()
        XCTAssertEqual(try decodeFile(backupURL).lists, [a])

        await repository.setLists([c], selectedListID: c.id, generation: 3)
        await repository.flush()
        XCTAssertEqual(try decodeFile(backupURL).lists, [b])
        XCTAssertEqual(try decodeFile(primaryURL).lists, [c])
    }

    // MARK: - Atomares Schreiben

    func testWriteFailureKeepsPreviousFileAndLeavesNoTemporaryFile() async throws {
        let probe = WriteProbe()
        let repository = makeRepository(writer: probe.writer)
        let a = sampleList("A")
        let b = sampleList("B")

        await repository.setLists([a], selectedListID: a.id, generation: 1)
        await repository.flush()
        let before = try Data(contentsOf: primaryURL)

        probe.mode = .failAfterPartialWrite
        await repository.setLists([b], selectedListID: b.id, generation: 2)
        await repository.flush()

        XCTAssertEqual(try Data(contentsOf: primaryURL), before, "lists.json bleibt unveraendert")
        XCTAssertFalse(FileManager.default.fileExists(atPath: temporaryURL.path))
        XCTAssertEqual(makeRepository().initialSnapshot.lists, [a])

        // Der Zustand bleibt ausstehend und wird beim naechsten Flush nachgeholt.
        probe.mode = .succeed
        await repository.flush()
        XCTAssertEqual(try decodeFile(primaryURL).lists, [b])
        XCTAssertEqual(try decodeFile(backupURL).lists, [a])
    }

    func testWriteFailureBeforeAnyFileExistsCreatesNothing() async throws {
        let probe = WriteProbe()
        probe.mode = .failImmediately
        let repository = makeRepository(writer: probe.writer)
        let list = sampleList("A")

        await repository.setLists([list], selectedListID: list.id, generation: 1)
        await repository.flush()

        XCTAssertFalse(FileManager.default.fileExists(atPath: primaryURL.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: temporaryURL.path))
    }

    // MARK: - Debounce

    func testWritesAreDebouncedAndCoalescedIntoOneWrite() async throws {
        let sleeper = ManualSleeper()
        let probe = WriteProbe()
        let repository = makeRepository(sleeper: { _ in try await sleeper.sleep() }, writer: probe.writer)
        let a = sampleList("A")
        let b = sampleList("B")
        let c = sampleList("C")

        await repository.setLists([a], selectedListID: a.id, generation: 1)
        await repository.setLists([a, b], selectedListID: b.id, generation: 2)
        await repository.setLists([a, b, c], selectedListID: c.id, generation: 3)
        await repository.setSession(activeTourListID: c.id, routeMode: .listOrder, generation: 1)

        let timersStarted = await waitUntil { await sleeper.requestCount == 4 }
        XCTAssertTrue(timersStarted)
        XCTAssertEqual(probe.count, 0, "Vor Ablauf der Wartezeit wird nicht geschrieben")
        XCTAssertFalse(FileManager.default.fileExists(atPath: primaryURL.path))

        await sleeper.fire()
        let written = await waitUntil { probe.count == 1 }
        XCTAssertTrue(written)

        // Weitere Zeit und ein Flush ohne neue Aenderung schreiben nichts mehr.
        await repository.flush()
        XCTAssertEqual(probe.count, 1)
        let stored = try decodeFile(primaryURL)
        XCTAssertEqual(stored.lists, [a, b, c])
        XCTAssertEqual(stored.selectedListID, c.id)
        XCTAssertEqual(stored.activeTourListID, c.id)
        XCTAssertEqual(stored.routeMode, .listOrder)
    }

    func testDefaultDebounceIsThreeHundredMilliseconds() async throws {
        let requested = RequestedDurations()
        let repository = makeRepository(sleeper: { duration in
            await requested.append(duration)
            try await Task.sleep(for: .seconds(60))
        })
        let list = sampleList("A")
        await repository.setLists([list], selectedListID: list.id, generation: 1)

        let seen = await waitUntil { await requested.values.count == 1 }
        XCTAssertTrue(seen)
        let values = await requested.values
        XCTAssertEqual(values, [.milliseconds(300)])
        await repository.flush()
    }

    func testFlushWritesImmediatelyAndCancelsPendingTimer() async throws {
        let sleeper = ManualSleeper()
        let probe = WriteProbe()
        let repository = makeRepository(sleeper: { _ in try await sleeper.sleep() }, writer: probe.writer)
        let list = sampleList("A")

        await repository.setLists([list], selectedListID: list.id, generation: 1)
        _ = await waitUntil { await sleeper.requestCount == 1 }
        await repository.flush()

        XCTAssertEqual(probe.count, 1)
        XCTAssertEqual(try decodeFile(primaryURL).lists, [list])
        let cancelled = await waitUntil { await sleeper.pendingCount == 0 }
        XCTAssertTrue(cancelled)

        await sleeper.fire()
        try await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(probe.count, 1, "Der abgebrochene Timer schreibt nicht ein zweites Mal")
    }

    func testStaleGenerationIsIgnored() async throws {
        let repository = makeRepository()
        let newer = sampleList("Neu")
        let older = sampleList("Alt")

        await repository.setLists([newer], selectedListID: newer.id, generation: 5)
        await repository.setLists([older], selectedListID: older.id, generation: 4)
        await repository.flush()

        XCTAssertEqual(try decodeFile(primaryURL).lists, [newer])
    }

    func testUnchangedStateDoesNotScheduleWrite() async throws {
        let probe = WriteProbe()
        let repository = makeRepository(writer: probe.writer)
        let list = sampleList("A")
        await repository.setLists([list], selectedListID: list.id, generation: 1)
        await repository.flush()
        XCTAssertEqual(probe.count, 1)

        await repository.setLists([list], selectedListID: list.id, generation: 2)
        await repository.setSession(activeTourListID: nil, routeMode: .optimized, generation: 1)
        await repository.flush()
        XCTAssertEqual(probe.count, 1)
    }
}

private actor RequestedDurations {
    private(set) var values: [Duration] = []
    func append(_ value: Duration) { values.append(value) }
}
