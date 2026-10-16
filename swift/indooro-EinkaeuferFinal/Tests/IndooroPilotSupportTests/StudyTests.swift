import XCTest
@testable import IndooroPilotSupport

final class StudyTests: XCTestCase {
    func testIdentifiersAndCSVQuoting() {
        for value in ["T1", "T07", "T123"] { XCTAssertTrue(StudyFormat.isValidID(value)) }
        for value in ["Anna", "T", "T1234", "T1\n", "../T1", " T1", "T١"] { XCTAssertFalse(StudyFormat.isValidID(value)) }
        XCTAssertEqual(StudyFormat.csvField("Käse, \"mild\"\nneu"), "\"Käse, \"\"mild\"\"\nneu\"")
        XCTAssertEqual(StudyFormat.header.split(separator: ",").count, 16)
    }
    func testCounterDifferencesNeverInventMissingMeasurements() {
        let start = StudyCounters(routeBuildCount: 4, rerouteCount: 2, stopChangeWithoutEventCount: 1, manualPositionCount: 5)
        let end = StudyCounters(routeBuildCount: 7, rerouteCount: 3, stopChangeWithoutEventCount: 1, manualPositionCount: 6)
        XCTAssertEqual(end.difference(from: start).manualPositionCount, 1)
        XCTAssertEqual(end.difference(from: start).rerouteCount, 1)
        XCTAssertEqual(end.difference(from: start).stopChangeWithoutEventCount, 0)
        XCTAssertNil(start.difference(from: end).rerouteCount)
        XCTAssertNil(StudyCounters().difference(from: start).manualPositionCount)
    }
    @MainActor
    func testLocalSessionDurationOutcomesAndPersistence() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var clock = Date(timeIntervalSince1970: 1_792_152_000)
        var uptime: TimeInterval = 100
        let store = StudySessionStore(root: root, enabled: true, now: { clock }, uptime: { uptime })
        XCTAssertThrowsError(try store.createSession(testId: "Anna", storeCode: "TEST", tasks: []))
        let tasks = [StudyTask(no: 1, productId: 101, productName: "Testprodukt A", layoutCode: "310/1/1/1"),
                     StudyTask(no: 2, productId: 102, productName: "Testprodukt B", condition: .withoutApp)]
        try store.createSession(testId: "T01", storeCode: "SYNTHETISCH", tasks: tasks)
        try store.start(taskNo: 1, positioningMode: "ohne_ortung")
        XCTAssertThrowsError(try store.start(taskNo: 2, positioningMode: "ohne_ortung"))
        store.recordError("Synthetischer Suchfehler")
        try store.addNote("Synthetischer Test, keine echten Personen")
        uptime += 48.04; clock += 1 // Wall clock changes must not distort duration.
        try store.finish(.found)
        XCTAssertEqual(try XCTUnwrap(store.session?.rows.first?.duration), 48.04, accuracy: 0.001)
        XCTAssertThrowsError(try store.start(taskNo: 1, positioningMode: "ohne_ortung"))
        try store.start(taskNo: 2, positioningMode: "mit_ortung")
        uptime += 22; clock += 22
        try store.finish(.help)
        XCTAssertEqual(store.session?.rows[1].positioningMode, "-")
        let urls = try store.exportURLs()
        XCTAssertEqual(urls.map(\.pathExtension), ["csv", "jsonl"])
        let csv = try String(contentsOf: urls[0])
        XCTAssertTrue(csv.hasPrefix(StudyFormat.header + "\n"))
        XCTAssertTrue(csv.contains(",48.0,gefunden,-,-,-,1"))
        XCTAssertFalse(csv.contains("keine echten Personen"))
        let events = try String(contentsOf: urls[1]).split(separator: "\n")
        XCTAssertEqual(events.count, 6)
        for event in events { XCTAssertNoThrow(try JSONSerialization.jsonObject(with: Data(event.utf8))) }
        let restored = StudySessionStore(root: root, enabled: true)
        XCTAssertEqual(restored.session?.rows.count, 2)
        XCTAssertEqual(restored.session?.testId, "T01")
        let unknown = root.appendingPathComponent("nicht-loeschen.txt")
        try Data("test".utf8).write(to: unknown)
        try restored.deleteAll()
        XCTAssertTrue(FileManager.default.fileExists(atPath: unknown.path))
        XCTAssertNil(restored.session)
    }
    @MainActor
    func testDisabledStoreCannotStartStudy() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = StudySessionStore(root: root, enabled: false)
        XCTAssertThrowsError(try store.createSession(testId: "T01", storeCode: "TEST", tasks: []))
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.path))
    }
}
