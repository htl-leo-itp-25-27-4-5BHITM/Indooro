import IndooroModels
import XCTest
import simd
@testable import IndooroNavigationCore

/// Feld-Export der Replay-Ticks (Task 4.3, establish-pilot-field-measurement).
///
/// `swift test --filter FieldExport` schreibt je Aufnahme `<name>-ticks.csv` (Spalten: `NavigationReplay.csvHeader`).
/// Der Helfer `FieldExport.write` schreibt nach `FIELD_EXPORT_DIR`, sonst nach `NavigationFixtures/exports/`
/// (gitignored, echte Felddaten bleiben lokal).
///
/// Exportiert werden nur Aufnahmen aus `NavigationFixtures/recordings/` mit Dateiname `<site>-YYYY-MM-DD-<n>.jsonl`.
/// Jede Aufnahme braucht ihr Layout `Resources/layout-<site>.json`; `FIELD_EXPORT_LAYOUT` (Pfad zu einer Layout-JSON)
/// ersetzt das Layout fuer alle Aufnahmen. `NavigationFixtures/incoming/` wird bewusst nicht exportiert.
enum FieldExport {
    static let environmentKey = "FIELD_EXPORT_DIR"
    static let layoutEnvironmentKey = "FIELD_EXPORT_LAYOUT"
    /// Einzelne Aufnahme (beliebiger Pfad, kein Namensmuster noetig); setzt `scripts/field/analyze_walk.sh`.
    static let singleRecordingEnvironmentKey = "FIELD_REPLAY_RECORDING"
    /// Ausgabename fuer `FIELD_REPLAY_RECORDING`; Standard: Dateiname ohne Endung.
    static let singleNameEnvironmentKey = "FIELD_REPLAY_NAME"

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

    /// `NavigationFixtures/recordings/`: anonymisierte Feldaufnahmen.
    static var recordingsDirectory: URL {
        fixturesDirectory.appendingPathComponent("recordings", isDirectory: true)
    }

    /// `Tests/IndooroNavigationCoreTests/Resources/`: Layouts `layout-<site>.json`.
    static var layoutDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // IndooroNavigationCoreTests
            .appendingPathComponent("Resources", isDirectory: true)
    }

    /// `FIELD_EXPORT_LAYOUT`: Layout-JSON, das fuer alle Aufnahmen gilt; sonst `nil`.
    static var layoutOverride: URL? {
        guard let path = ProcessInfo.processInfo.environment[layoutEnvironmentKey], !path.isEmpty else { return nil }
        return URL(fileURLWithPath: path)
    }

    /// Site aus einem Aufnahmedateinamen `<site>-YYYY-MM-DD-<n>.jsonl`, z. B. `grosser-raum-2026-11-02-1.jsonl`
    /// -> `grosser-raum`. `nil`, wenn der Name nicht diesem Muster folgt.
    static func siteName(fromRecordingFileName fileName: String) -> String? {
        let extensionSuffix = ".jsonl"
        guard fileName.hasSuffix(extensionSuffix) else { return nil }
        let stem = String(fileName.dropLast(extensionSuffix.count))
        let parts = stem.split(separator: "-", omittingEmptySubsequences: false).map(String.init)
        guard parts.count >= 5 else { return nil }
        let year = parts[parts.count - 4]
        let month = parts[parts.count - 3]
        let day = parts[parts.count - 2]
        let index = parts[parts.count - 1]
        let site = parts.dropLast(4)
        guard year.count == 4, year.allSatisfy({ $0.isNumber }),
              month.count == 2, month.allSatisfy({ $0.isNumber }),
              day.count == 2, day.allSatisfy({ $0.isNumber }),
              !index.isEmpty, index.allSatisfy({ $0.isNumber }),
              site.allSatisfy({ !$0.isEmpty }) else {
            return nil
        }
        return site.joined(separator: "-")
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

    /// `REPLAY`-Zeile mit den Kennzahlen des Replays (gleiches Format wie `NavigationReplayTests`).
    static func replayLine(name: String, metrics: ReplayMetrics) -> String {
        let delays = metrics.offRouteDetectionDelays.map { String(format: "%.2f", $0) }.joined(separator: ",")
        return "REPLAY \(name) ticks=\(metrics.tickCount) duration=\(String(format: "%.1f", metrics.durationSeconds))s "
            + "reroutes=\(metrics.rerouteCount) reroutesPerMin=\(String(format: "%.2f", metrics.reroutesPerMinute)) "
            + "stopChanges=\(metrics.activeStopChangesWithoutEvent) jumps=\(metrics.projectedJumps) maxStep=\(String(format: "%.2f", metrics.maxProjectedStepMeters)) "
            + "lagMean=\(metrics.meanLagMeters.map { String(format: "%.2f", $0) } ?? "-") "
            + "lagP95=\(metrics.p95LagMeters.map { String(format: "%.2f", $0) } ?? "-") "
            + "offRouteDelays=[\(delays)] lowConfToggles=\(metrics.lowConfidenceToggles) "
            + "planning=\(metrics.planningSeconds.count)x"
    }

    /// Replay einer einzelnen Aufnahme mit explizitem Layout. Schreibt `<name>-ticks.csv` und `<name>-replay.txt`
    /// (die `REPLAY`-Zeile) nach `directory`. `scripts/field/analyze_walk.sh` liest beide Dateien.
    @discardableResult
    static func replaySingle(
        recording: URL,
        layout layoutURL: URL,
        name: String,
        to directory: URL
    ) throws -> (ticks: URL, replay: URL, metrics: ReplayMetrics) {
        let layout = try JSONDecoder().decode(LayoutData.self, from: Data(contentsOf: layoutURL))
        let lines = try NavigationRecordLine.parse(jsonl: String(contentsOf: recording, encoding: .utf8))
        let written = try write(recording: lines, layout: layout, name: name, to: directory)
        let replayURL = directory.appendingPathComponent("\(name)-replay.txt")
        try (replayLine(name: name, metrics: written.metrics) + "\n").write(to: replayURL, atomically: true, encoding: .utf8)
        return (written.url, replayURL, written.metrics)
    }

    struct ExportSummary: Equatable {
        /// Zahl der `.jsonl`-Dateien im Aufnahmeverzeichnis.
        var recordingCount: Int
        /// Namen (ohne Endung) der exportierten Aufnahmen.
        var exported: [String]
        /// Dateinamen der uebersprungenen Aufnahmen (kein Layout).
        var skipped: [String]
    }

    /// Exportiert jede `.jsonl`-Aufnahme aus `recordingsDirectory` mit ihrem Layout: `layoutOverride` falls gesetzt,
    /// sonst `layoutDirectory/layout-<site>.json`. Aufnahmen ohne Layout werden uebersprungen. Je Aufnahme geht eine
    /// Zeile an `report` (Standard: `print`).
    @discardableResult
    static func exportRecordings(
        recordingsDirectory: URL,
        layoutDirectory: URL,
        layoutOverride: URL?,
        to outputDirectory: URL,
        report: (String) -> Void = { print($0) }
    ) throws -> ExportSummary {
        let contents = (try? FileManager.default.contentsOfDirectory(at: recordingsDirectory, includingPropertiesForKeys: nil)) ?? []
        let recordings = contents
            .filter { $0.pathExtension == "jsonl" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        var summary = ExportSummary(recordingCount: recordings.count, exported: [], skipped: [])

        for recording in recordings {
            let fileName = recording.lastPathComponent
            let name = recording.deletingPathExtension().lastPathComponent
            let site = siteName(fromRecordingFileName: fileName)

            let layoutCandidate = site.map { layoutDirectory.appendingPathComponent("layout-\($0).json") }
            let resolvedLayout: URL?
            if let layoutOverride {
                resolvedLayout = layoutOverride
            } else if let layoutCandidate, FileManager.default.fileExists(atPath: layoutCandidate.path) {
                resolvedLayout = layoutCandidate
            } else {
                resolvedLayout = nil
            }
            guard let layoutURL = resolvedLayout else {
                let missing = site.map { "layout-\($0).json fehlt" } ?? "Site nicht erkennbar (<site>-YYYY-MM-DD-<n>.jsonl), kein Layout"
                report("FIELD-EXPORT skipped \(fileName): \(missing)")
                summary.skipped.append(fileName)
                continue
            }

            let layout = try JSONDecoder().decode(LayoutData.self, from: Data(contentsOf: layoutURL))
            let lines = try NavigationRecordLine.parse(jsonl: String(contentsOf: recording, encoding: .utf8))
            let written = try write(recording: lines, layout: layout, name: name, to: outputDirectory)
            report(replayLine(name: name, metrics: written.metrics))
            summary.exported.append(name)
        }
        return summary
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

    func testSiteNameFromRecordingFileName() {
        XCTAssertEqual(FieldExport.siteName(fromRecordingFileName: "testraum-2026-10-20-3.jsonl"), "testraum")
        XCTAssertEqual(FieldExport.siteName(fromRecordingFileName: "grosser-raum-2026-11-02-1.jsonl"), "grosser-raum")
        XCTAssertNil(FieldExport.siteName(fromRecordingFileName: "foo.jsonl"))
        XCTAssertNil(FieldExport.siteName(fromRecordingFileName: "testraum-2026-10-20-3.json"))
        XCTAssertNil(FieldExport.siteName(fromRecordingFileName: "testraum-26-10-20-3.jsonl"))
        XCTAssertNil(FieldExport.siteName(fromRecordingFileName: "-2026-10-20-3.jsonl"))
    }

    /// Hermetisch: Aufnahmen, Layouts und Ausgabe liegen in einem temporaeren Verzeichnis, `NavigationFixtures` bleibt unberuehrt.
    func testExportRecordingsUsesLayoutPerSiteInTemporaryDirectories() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("fieldexport-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let recordings = root.appendingPathComponent("recordings", isDirectory: true)
        let layouts = root.appendingPathComponent("layouts", isDirectory: true)
        let output = root.appendingPathComponent("exports", isDirectory: true)
        try FileManager.default.createDirectory(at: recordings, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: layouts, withIntermediateDirectories: true)

        // Kleine synthetische Aufnahme auf dem Demo-Layout; dieselbe Datei liegt fuer "testraum" und "unbekannt" vor.
        var synthetic = SyntheticRecording(layout: try layout(), seed: 55)
        synthetic.event(.startTour, plan: [RecordedStop(id: "A", title: "A", x: 30.5, y: 9.5)])
        synthetic.walk([SIMD2(2.5, 9.5), SIMD2(10.5, 9.5)], speed: 1.2)
        synthetic.stand(at: SIMD2(10.5, 9.5), seconds: 5)
        let text = try NavigationRecordLine.jsonl(synthetic.lines)
        try text.write(to: recordings.appendingPathComponent("testraum-2026-10-20-3.jsonl"), atomically: true, encoding: .utf8)
        try text.write(to: recordings.appendingPathComponent("unbekannt-2026-10-20-1.jsonl"), atomically: true, encoding: .utf8)
        try "keine Aufnahme".write(to: recordings.appendingPathComponent("notiz.txt"), atomically: true, encoding: .utf8)
        // Layout nur fuer "testraum": "unbekannt" bleibt ohne Layout.
        let layoutData = try TestLayouts.demoSupermarketData()
        try layoutData.write(to: layouts.appendingPathComponent("layout-testraum.json"))

        var lines: [String] = []
        let summary = try FieldExport.exportRecordings(
            recordingsDirectory: recordings,
            layoutDirectory: layouts,
            layoutOverride: nil,
            to: output,
            report: { lines.append($0) }
        )

        XCTAssertEqual(summary, FieldExport.ExportSummary(
            recordingCount: 2,
            exported: ["testraum-2026-10-20-3"],
            skipped: ["unbekannt-2026-10-20-1.jsonl"]
        ))
        XCTAssertTrue(lines.contains { $0.hasPrefix("REPLAY testraum-2026-10-20-3 ") }, "REPLAY-Zeile fehlt: \(lines)")
        XCTAssertTrue(lines.contains("FIELD-EXPORT skipped unbekannt-2026-10-20-1.jsonl: layout-unbekannt.json fehlt"), "Skip-Zeile fehlt: \(lines)")

        // Export muss exakt dem Replay mit dem geladenen Layout entsprechen.
        let decodedLayout = try JSONDecoder().decode(LayoutData.self, from: layoutData)
        var ticks: [ReplayTick] = []
        _ = NavigationReplay.run(recording: synthetic.lines, layout: decodedLayout, onTick: { ticks.append($0) })
        let written = try String(contentsOf: output.appendingPathComponent("testraum-2026-10-20-3-ticks.csv"), encoding: .utf8)
        XCTAssertEqual(written, NavigationReplay.csv(ticks: ticks))
        XCTAssertFalse(FileManager.default.fileExists(atPath: output.appendingPathComponent("unbekannt-2026-10-20-1-ticks.csv").path))
    }

    /// Echte Aufnahmen aus `NavigationFixtures/recordings/`: jede mit ihrem Layout exportieren.
    /// Ohne Aufnahmen oder ohne passende Layouts wird uebersprungen (Gruende stehen in der Testausgabe).
    func testFieldExportOfIncomingRecordings() throws {
        let summary = try FieldExport.exportRecordings(
            recordingsDirectory: FieldExport.recordingsDirectory,
            layoutDirectory: FieldExport.layoutDirectory,
            layoutOverride: FieldExport.layoutOverride,
            to: FieldExport.defaultDirectory
        )
        guard summary.recordingCount > 0 else {
            throw XCTSkip("Keine Aufnahmen in NavigationFixtures/recordings")
        }
        guard !summary.exported.isEmpty else {
            throw XCTSkip("\(summary.recordingCount) Aufnahme(n) ohne Layout: Resources/layout-<site>.json ablegen oder FIELD_EXPORT_LAYOUT setzen")
        }
        XCTAssertEqual(summary.exported.count + summary.skipped.count, summary.recordingCount)
    }

    /// `FIELD_REPLAY_RECORDING` + `FIELD_EXPORT_LAYOUT`: eine Aufnahme (z. B. frisch vom iPhone) durch dieselbe Kette wie die App.
    /// Ohne die Variablen uebersprungen. Ausgabe: `FIELD_EXPORT_DIR` bzw. `NavigationFixtures/exports/`.
    func testFieldReplayOfSingleRecording() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let recordingPath = environment[FieldExport.singleRecordingEnvironmentKey], !recordingPath.isEmpty else {
            throw XCTSkip("\(FieldExport.singleRecordingEnvironmentKey) nicht gesetzt (nur fuer scripts/field/analyze_walk.sh)")
        }
        guard let layoutURL = FieldExport.layoutOverride else {
            throw XCTSkip("\(FieldExport.layoutEnvironmentKey) nicht gesetzt")
        }
        let recording = URL(fileURLWithPath: recordingPath)
        let name = environment[FieldExport.singleNameEnvironmentKey].flatMap { $0.isEmpty ? nil : $0 }
            ?? recording.deletingPathExtension().lastPathComponent
        let result = try FieldExport.replaySingle(recording: recording, layout: layoutURL, name: name, to: FieldExport.defaultDirectory)
        print(FieldExport.replayLine(name: name, metrics: result.metrics))
        XCTAssertGreaterThan(result.metrics.tickCount, 0, "Aufnahme ohne Ticks: leer oder ohne Messungen")
    }

    func testReplaySingleWritesTicksAndReplayLine() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("fieldexport-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var synthetic = SyntheticRecording(layout: try layout(), seed: 7)
        synthetic.walk([SIMD2(2.5, 9.5), SIMD2(10.5, 9.5)], speed: 1.2)
        synthetic.stand(at: SIMD2(10.5, 9.5), seconds: 5)
        let recording = root.appendingPathComponent("synthetic-single.jsonl")
        try NavigationRecordLine.jsonl(synthetic.lines).write(to: recording, atomically: true, encoding: .utf8)
        let layoutURL = root.appendingPathComponent("layout.json")
        try TestLayouts.demoSupermarketData().write(to: layoutURL)

        let output = root.appendingPathComponent("out", isDirectory: true)
        let result = try FieldExport.replaySingle(recording: recording, layout: layoutURL, name: "synthetic-single", to: output)
        XCTAssertEqual(result.ticks.lastPathComponent, "synthetic-single-ticks.csv")
        XCTAssertEqual(result.replay.lastPathComponent, "synthetic-single-replay.txt")
        let line = try String(contentsOf: result.replay, encoding: .utf8)
        XCTAssertTrue(line.hasPrefix("REPLAY synthetic-single ticks=\(result.metrics.tickCount) "), line)
        XCTAssertGreaterThan(result.metrics.tickCount, 0)
    }

    /// `scan`-Zeilen (fremde iBeacons) sind Diagnose: sie aendern weder Ticks noch Metriken des Replays.
    func testScanLinesDoNotChangeReplay() throws {
        let layout = try layout()
        var synthetic = SyntheticRecording(layout: layout, seed: 11)
        synthetic.walk([SIMD2(2.5, 9.5), SIMD2(10.5, 9.5)], speed: 1.2)
        let baseline = NavigationReplay.run(recording: synthetic.lines, layout: layout)

        let first = synthetic.lines.first!.timestamp
        let last = synthetic.lines.last!.timestamp
        var mixed = synthetic.lines
        mixed.insert(.scan(ScanRecord(t: first - 100, major: 9, minor: 9, rssi: -80)), at: 0)
        mixed.append(.scan(ScanRecord(t: last + 100, major: 9, minor: 9, rssi: -80)))
        mixed.append(.scan(ScanRecord(t: (first + last) / 2, major: 1, minor: 2, rssi: -70)))
        XCTAssertEqual(NavigationReplay.run(recording: mixed, layout: layout), baseline)

        let text = try NavigationRecordLine.jsonl(mixed)
        XCTAssertTrue(text.contains(#""type":"scan""#))
        XCTAssertEqual(try NavigationRecordLine.parse(jsonl: text), mixed)
    }
}
