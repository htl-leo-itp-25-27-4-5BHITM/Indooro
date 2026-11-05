import IndooroModels
import XCTest
import simd
@testable import IndooroNavigationCore

/// Format indooro-recording/2: `session`, `sync`, `truth.marker` (Roundtrip, Abwaertskompatibilitaet,
/// Replay ignoriert die neuen Zeilen).
final class RecordingMetadataTests: XCTestCase {
    private func session(scenario: SessionScenario? = .S1, role: SessionRole? = .evaluation) -> SessionRecord {
        SessionRecord(
            t: 1_792_000_000, schema: RecordingMetadata.schema, app: "1.4.0 (123)",
            deviceModel: "iPhone15,3", os: "iOS 18.1", scenario: scenario, role: role
        )
    }

    func testSessionSyncAndMarkerRoundTrip() throws {
        let lines: [NavigationRecordLine] = [
            .session(session()),
            .truth(TruthRecord(t: 1_792_000_004.9, x: 11, y: 5, marker: "M3")),
            .truth(TruthRecord(t: 1_792_000_005.9, x: 12, y: 5, marker: nil)),
            .sync(SyncRecord(t: 1_792_000_100, label: "sync-1")),
        ]
        let text = try NavigationRecordLine.jsonl(lines)
        XCTAssertTrue(text.contains(#""type":"session""#))
        XCTAssertTrue(text.contains(#""schema":"indooro-recording/2""#))
        XCTAssertTrue(text.contains(#""scenario":"S1""#))
        XCTAssertTrue(text.contains(#""role":"evaluation""#))
        XCTAssertTrue(text.contains(#""marker":"M3""#))
        XCTAssertTrue(text.contains(#""label":"sync-1""#))
        XCTAssertEqual(try NavigationRecordLine.parse(jsonl: text), lines)
        XCTAssertEqual(lines[0].timestamp, 1_792_000_000)
        XCTAssertEqual(lines[3].timestamp, 1_792_000_100)
    }

    func testOptionalFieldsAreOmittedWhenNil() throws {
        let sessionText = try NavigationRecordLine.session(session(scenario: nil, role: nil)).jsonLine()
        XCTAssertFalse(sessionText.contains("scenario"))
        XCTAssertFalse(sessionText.contains("role"))
        let truthText = try NavigationRecordLine.truth(TruthRecord(t: 1, x: 2, y: 3)).jsonLine()
        XCTAssertFalse(truthText.contains("marker"))
    }

    func testOldTruthLineWithoutMarkerStillDecodes() throws {
        let parsed = try NavigationRecordLine.parse(jsonl: #"{"type":"truth","t":1,"x":2,"y":3}"# + "\n")
        XCTAssertEqual(parsed, [.truth(TruthRecord(t: 1, x: 2, y: 3, marker: nil))])
    }

    func testMetadataHelpersProduceFormatConformValues() throws {
        XCTAssertEqual(RecordingMetadata.markerLabel(3), "M3")
        XCTAssertEqual(RecordingMetadata.markerLabel(30), "M30")
        XCTAssertNil(RecordingMetadata.markerLabel(1000))
        XCTAssertEqual(RecordingMetadata.syncLabel(1), "sync-1")
        XCTAssertNil(RecordingMetadata.syncLabel(10_000))
        XCTAssertTrue(RecordingMetadata.isValidMarker("M12"))
        XCTAssertFalse(RecordingMetadata.isValidMarker("M"))
        XCTAssertFalse(RecordingMetadata.isValidMarker("M1234"))
        XCTAssertFalse(RecordingMetadata.isValidMarker("m1"))
        XCTAssertFalse(RecordingMetadata.isValidMarker("M1a"))
        XCTAssertTrue(RecordingMetadata.isValidSyncLabel("sync-42"))
        XCTAssertFalse(RecordingMetadata.isValidSyncLabel("sync-"))
        XCTAssertFalse(RecordingMetadata.isValidSyncLabel("sync-12345"))
        XCTAssertFalse(RecordingMetadata.isValidSyncLabel("Sync-1"))

        XCTAssertEqual(RecordingMetadata.appString(shortVersion: "1.4.0", build: "123"), "1.4.0 (123)")
        XCTAssertEqual(RecordingMetadata.appString(shortVersion: nil, build: nil), "0 (0)")
        XCTAssertEqual(RecordingMetadata.appString(shortVersion: String(repeating: "9", count: 50), build: "1").count, 32)
        XCTAssertEqual(RecordingMetadata.deviceModelString(machine: "iPhone15,3"), "iPhone15,3")
        XCTAssertEqual(RecordingMetadata.deviceModelString(machine: "arm64"), "arm64")
        XCTAssertEqual(RecordingMetadata.deviceModelString(machine: "Max's Phone"), "arm64")
        XCTAssertEqual(RecordingMetadata.osString(major: 18, minor: 1, patch: 0), "iOS 18.1")
        XCTAssertEqual(RecordingMetadata.osString(major: 17, minor: 6, patch: 1), "iOS 17.6.1")

        let record = RecordingMetadata.sessionRecord(
            t: 5, shortVersion: "1.4.0", build: "123", machine: "iPhone15,3",
            osMajor: 18, osMinor: 1, osPatch: 0, scenario: .S2, role: .calibration
        )
        XCTAssertEqual(record.schema, "indooro-recording/2")
        XCTAssertEqual(record.app, "1.4.0 (123)")
        XCTAssertEqual(record.os, "iOS 18.1")
        XCTAssertEqual(SessionScenario.allCases.map(\.rawValue), ["S1", "S2", "S3", "S4"])
        XCTAssertEqual(SessionRole.calibration.rawValue, "calibration")
    }

    /// `session`- und `sync`-Zeilen tragen keine Messung: weder Ticks noch Metriken des Replays aendern sich.
    func testReplayIgnoresSessionAndSyncLines() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: 8)
        var synthetic = SyntheticRecording(layout: layout, seed: 11)
        synthetic.walk([SIMD2(2.5, 9.5), SIMD2(10.5, 9.5)], speed: 1.2)
        let baseline = NavigationReplay.run(recording: synthetic.lines, layout: layout)

        let first = synthetic.lines.first!.timestamp
        let last = synthetic.lines.last!.timestamp
        var mixed = synthetic.lines
        mixed.insert(.session(session()), at: 0)
        mixed.insert(.sync(SyncRecord(t: first - 100, label: "sync-1")), at: 1)
        mixed.append(.sync(SyncRecord(t: last + 100, label: "sync-2")))
        XCTAssertEqual(NavigationReplay.run(recording: mixed, layout: layout), baseline)
    }
}
