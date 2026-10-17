import XCTest
import simd
@testable import IndooroNavigationCore

/// Schritt- und Kompass-Zeilen im Aufzeichnungsformat: Roundtrip, Abwaertskompatibilitaet und
/// Gleichheit des Replays mit und ohne eingestreute Bewegungszeilen (motionAided noch nicht ausgewertet).
final class MotionRecordingTests: XCTestCase {
    private func layout() throws -> LayoutData {
        try TestLayouts.demoSupermarket(beaconSpacing: 8)
    }

    private func roundTrip(_ lines: [NavigationRecordLine]) throws -> [NavigationRecordLine] {
        try NavigationRecordLine.parse(jsonl: NavigationRecordLine.jsonl(lines))
    }

    private func stop(_ id: String, _ x: Float, _ y: Float) -> RecordedStop {
        RecordedStop(id: id, title: id, x: x, y: y)
    }

    // MARK: - Format

    func testStepAndHeadingRecordsRoundTripThroughJSONLines() throws {
        let lines: [NavigationRecordLine] = [
            .step(StepRecord(t: 1_000_001.5, steps: 12, distance: 8.4, source: "pedometer")),
            .step(StepRecord(t: 1_000_002.0, steps: 13, distance: nil, source: "pedometer")),
            .heading(HeadingRecord(t: 1_000_001.7, degrees: 271.5, accuracy: 10, source: "compass")),
        ]
        let text = try NavigationRecordLine.jsonl(lines)
        XCTAssertTrue(text.contains("\"type\":\"step\""))
        XCTAssertTrue(text.contains("\"type\":\"heading\""))
        XCTAssertEqual(try NavigationRecordLine.parse(jsonl: text), lines)
    }

    // MARK: - Abwaertskompatibilitaet

    func testWalkRecordingRoundTripsAndUnknownLineTypeIsSkipped() throws {
        var recording = SyntheticRecording(layout: try layout(), seed: 3)
        recording.event(.startTour, plan: [stop("A", 30.5, 9.5)])
        recording.walk([SIMD2(2.5, 9.5), SIMD2(10.5, 9.5)], speed: 1.2)
        let lines = recording.lines
        XCTAssertEqual(try roundTrip(lines), lines)

        let future = "{\"type\":\"futureThing\",\"t\":1,\"x\":2}"
        var text = ""
        for (index, line) in lines.enumerated() {
            text += try line.jsonLine() + "\n"
            if index == 3 { text += future + "\n" }
        }
        let parsed = try NavigationRecordLine.parse(jsonl: text)
        XCTAssertEqual(parsed.count, lines.count)
        XCTAssertEqual(parsed, lines)
    }

    func testInvalidJSONStillThrows() throws {
        XCTAssertThrowsError(try NavigationRecordLine.parse(jsonl: "not json"))
        let valid = try NavigationRecordLine.jsonl([.truth(TruthRecord(t: 1, x: 2, y: 3))])
        XCTAssertThrowsError(try NavigationRecordLine.parse(jsonl: valid + "not json\n"))
    }

    func testKnownTypeWithMissingRequiredFieldStillThrows() throws {
        XCTAssertThrowsError(try NavigationRecordLine.parse(jsonl: "{\"type\":\"measurement\",\"t\":1,\"source\":\"rssi\"}\n"))
    }

    // MARK: - Replay-Gleichheit

    func testMotionLinesDoNotChangeReplayWhenFlagOff() throws {
        try assertMotionLinesAreInvisibleToReplay(motionAided: false)
    }

    func testMotionLinesDoNotChangeReplayWhenFlagOn() throws {
        try assertMotionLinesAreInvisibleToReplay(motionAided: true)
    }

    private func assertMotionLinesAreInvisibleToReplay(motionAided: Bool) throws {
        let layout = try layout()
        var recording = SyntheticRecording(layout: layout, seed: 91)
        recording.event(.startTour, plan: [stop("A", 30.5, 9.5)])
        recording.walk([SIMD2(2.5, 9.5), SIMD2(30.5, 9.5)], speed: 1.2)
        let base = recording.lines
        let first = try XCTUnwrap(base.first?.timestamp)
        let last = try XCTUnwrap(base.last?.timestamp)

        // Bewegungszeilen vor der ersten und nach der letzten Zeile sowie verstreut dazwischen.
        var mixed: [NavigationRecordLine] = [
            .step(StepRecord(t: first - 50, steps: 0, distance: nil, source: "pedometer")),
            .heading(HeadingRecord(t: first - 50, degrees: 10, accuracy: 5, source: "compass")),
        ]
        for (index, line) in base.enumerated() {
            mixed.append(line)
            if index % 25 == 0 {
                mixed.append(.step(StepRecord(t: line.timestamp, steps: index, distance: Double(index) * 0.7, source: "pedometer")))
                mixed.append(.heading(HeadingRecord(t: line.timestamp, degrees: Double(index % 360), accuracy: 8, source: "compass")))
            }
        }
        mixed.append(.step(StepRecord(t: last + 50, steps: 999, distance: 700, source: "pedometer")))
        mixed.append(.heading(HeadingRecord(t: last + 50, degrees: 350, accuracy: 3, source: "compass")))

        var config = StabilizedNavigationConfig.default
        config.motion.motionAided = motionAided

        let plain = NavigationReplay.run(recording: try roundTrip(base), layout: layout, config: config)
        let withMotion = NavigationReplay.run(recording: try roundTrip(mixed), layout: layout, config: config)
        XCTAssertGreaterThan(plain.tickCount, 0)
        XCTAssertEqual(withMotion, plain)
        XCTAssertEqual(withMotion.tickCount, plain.tickCount)
        XCTAssertEqual(withMotion.durationSeconds, plain.durationSeconds)
    }

    // MARK: - Config

    func testMotionAidedIsOffByDefault() {
        XCTAssertFalse(StabilizedNavigationConfig.default.motion.motionAided)
    }
}
