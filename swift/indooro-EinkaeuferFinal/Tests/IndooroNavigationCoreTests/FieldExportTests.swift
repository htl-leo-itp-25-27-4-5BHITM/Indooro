import XCTest
import simd
@testable import IndooroNavigationCore

/// Feld-Export der Replay-Ticks (Task 4.3, establish-pilot-field-measurement).
///
/// `swift test --filter FieldExport` schreibt je Aufnahme `<name>-ticks.csv` (Spalten: `NavigationReplay.csvHeader`).
/// Der Helfer `FieldExport.write` schreibt nach `FIELD_EXPORT_DIR`, sonst nach `NavigationFixtures/exports/`
/// (gitignored, echte Felddaten bleiben lokal).
///
/// Echte Aufnahmen aus `NavigationFixtures/incoming/` und `NavigationFixtures/recordings/` haben je ein eigenes
/// Layout. Der Test `testFieldExportOfIncomingRecordings` ueberspringt deshalb mit Hinweis; echte Aufnahmen werden
/// spaeter mit ihrem Layout exportiert.
enum FieldExport {
    static let environmentKey = "FIELD_EXPORT_DIR"

    /// `NavigationFixtures/` im Repo, relativ zu dieser Datei.
    static var fixturesDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // IndooroNavigationCoreTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // indooro-EinkaeuferFinal
            .appendingPathComponent("NavigationFixtures", isDirectory: true)
    }

    /// Zielverzeichnis: `FIELD_EXPORT_DIR`, sonst `NavigationFixtures/exports/`.
    static var defaultDirectory: URL {
        if let custom = ProcessInfo.processInfo.environment[environmentKey], !custom.isEmpty {
            return URL(fileURLWithPath: custom, isDirectory: true)
        }
        return fixturesDirectory.appendingPathComponent("exports", isDirectory: true)
    }

    /// Replay mit Tick-Export; schreibt `<name>-ticks.csv` in `directory` (wird angelegt).
    @discardableResult
    static func write(
        recording: [NavigationRecordLine],
        layout: LayoutData,
        name: String,
        to directory: URL
    ) throws -> (url: URL, metrics: ReplayMetrics) {
        var ticks: [ReplayTick] = []
        let metrics = NavigationReplay.run(recording: recording, layout: layout, onTick: { ticks.append($0) })
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent("\(name)-ticks.csv")
        try NavigationReplay.csv(ticks: ticks).write(to: url, atomically: true, encoding: .utf8)
        return (url, metrics)
    }
}

final class FieldExportTests: XCTestCase {
    private func layout() throws -> LayoutData {
        try TestLayouts.demoSupermarket(beaconSpacing: 8)
    }

    func testFieldExportWritesTicksCSVForSyntheticRecording() throws {
        let layout = try layout()
        // Gleiche Aufnahme wie `testWrongAisleCausesExactlyOneReroute`: enthaelt genau einen Reroute.
        var recording = SyntheticRecording(layout: layout, seed: 55)
        recording.event(.startTour, plan: [RecordedStop(id: "A", title: "A", x: 30.5, y: 9.5)])
        recording.walk([SIMD2(2.5, 9.5), SIMD2(10.5, 9.5)], speed: 1.2)
        let wrongAisle = SIMD2<Float>(10.5, 26.5)
        recording.blackout(seconds: 3, truth: wrongAisle)
        recording.stand(at: wrongAisle, seconds: 25)

        var ticks: [ReplayTick] = []
        let metrics = NavigationReplay.run(recording: recording.lines, layout: layout, onTick: { ticks.append($0) })
        XCTAssertEqual(ticks.count, metrics.tickCount)
        XCTAssertTrue(ticks.contains { $0.routeRebuild }, "falsche Gasse muss einen Routenbau ausloesen")

        let csv = NavigationReplay.csv(ticks: ticks)
        let rows = csv.split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
        XCTAssertEqual(rows.first, "t,truth_x,truth_y,est_x,est_y,proj_x,proj_y,confidence,beacons_used,route_rebuild,stop_change")
        XCTAssertEqual(rows.count - 1, metrics.tickCount)
        XCTAssertTrue(rows.dropFirst().allSatisfy { $0.split(separator: ",", omittingEmptySubsequences: false).count == 11 })

        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("fieldexport-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let written = try FieldExport.write(recording: recording.lines, layout: layout, name: "synthetic-wrong-aisle", to: directory)
        XCTAssertEqual(written.url.lastPathComponent, "synthetic-wrong-aisle-ticks.csv")
        XCTAssertEqual(written.metrics, metrics)
        XCTAssertEqual(try String(contentsOf: written.url, encoding: .utf8), csv)
    }

    /// Echte Aufnahmen: Layout je Aufnahme verschieden, daher hier nur Erkennung und Skip.
    /// Spaeter: Aufnahme mit ihrem Layout laden und `FieldExport.write(..., to: FieldExport.defaultDirectory)` aufrufen.
    func testFieldExportOfIncomingRecordings() throws {
        var files: [URL] = []
        for folder in ["incoming", "recordings"] {
            let directory = FieldExport.fixturesDirectory.appendingPathComponent(folder, isDirectory: true)
            let contents = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
            files += contents.filter { $0.pathExtension == "jsonl" }
        }
        guard !files.isEmpty else {
            throw XCTSkip("Keine Aufnahmen in NavigationFixtures/incoming oder NavigationFixtures/recordings")
        }
        // Echte Aufnahmen werden spaeter mit ihrem Layout exportiert; das Layout ist je Aufnahme nicht festgelegt.
        throw XCTSkip("\(files.count) Aufnahme(n) gefunden: Export braucht das Layout je Aufnahme, noch nicht zugeordnet")
    }
}
