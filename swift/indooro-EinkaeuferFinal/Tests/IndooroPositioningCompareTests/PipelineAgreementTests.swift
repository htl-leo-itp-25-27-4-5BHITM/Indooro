import IndooroModels
import XCTest
import simd
@testable import IndooroNavigationCore

/// The current-pipeline path must be the chain the app runs, and the engine path must agree with it where the two
/// share the core. Synthetic recording: this proves the harness, not the quality of either pipeline.
final class PipelineAgreementTests: XCTestCase {
    /// `NavigationReplay` (the chain the field tests use) without warm-up equals the current-pipeline path tick for tick.
    func testCurrentPathMatchesNavigationReplayWithoutWarmup() throws {
        var config = StabilizedNavigationConfig.default
        config.beacon.warmupSeconds = 0
        let lines = try NavigationRecordLine.parse(jsonl: ComparisonFixtures.recordingText())
        let layout = try ComparisonFixtures.layout()

        var replayTicks: [ReplayTick] = []
        _ = NavigationReplay.run(recording: lines, layout: layout, config: config) { replayTicks.append($0) }
        let plan = ReplayPlan(recording: lines, config: config)
        let path = CurrentPipelinePath.run(plan: plan, layout: layout, config: config)

        XCTAssertGreaterThan(replayTicks.count, 100)
        XCTAssertEqual(path.count, replayTicks.count)
        for (expected, actual) in zip(replayTicks, path) {
            XCTAssertEqual(actual.t, expected.t, accuracy: 1e-9)
            XCTAssertEqual(actual.displayed, expected.projected, "projected at t=\(expected.t)")
            XCTAssertEqual(actual.solved, expected.solved, "solved at t=\(expected.t)")
            XCTAssertEqual(actual.beaconsUsed, expected.beaconsUsed, "measurements at t=\(expected.t)")
            if expected.solved != nil {
                XCTAssertEqual(actual.confidence, expected.confidence, accuracy: 1e-6)
            }
        }
    }

    func testEnginePathMatchesCurrentPathTickForTick() async throws {
        let result = try await ComparisonFixtures.run()
        XCTAssertGreaterThan(result.epochCount, 100)
        XCTAssertEqual(result.unmappedEngineMeasurements, 0)
        for row in result.epochs {
            XCTAssertEqual(row.engine.t, row.current.t, accuracy: 1e-9)
            XCTAssertEqual(row.engine.displayed, row.current.displayed, "displayed at t=\(row.t)")
            XCTAssertEqual(row.engine.solved, row.current.solved, "raw point at t=\(row.t)")
            XCTAssertEqual(row.engine.beaconsUsed, row.current.beaconsUsed, "measurements at t=\(row.t)")
            XCTAssertEqual(row.engine.trusted, row.current.trusted, "trust at t=\(row.t)")
        }
        XCTAssertEqual(result.agreement.equalEpochs, result.epochCount)
        // Equal is only meaningful if the paths produced positions at all.
        XCTAssertGreaterThan(result.epochs.filter { $0.engine.displayed != nil }.count, 100)
        XCTAssertGreaterThan(result.epochs.filter { $0.engine.trusted }.count, 50)
    }

    /// A layout whose beacon identity cannot be resolved by the engine's catalog must show up as `unmapped`,
    /// never as a silent difference between the paths.
    func testSampleMapperReportsUnresolvableIdentity() throws {
        let json = """
        {"shopName": "T", "gridSize": {"width": 4, "height": 4}, "elements": [
          {"id": 1, "type": "beacon", "beaconId": "Dock-A", "x": 1, "y": 1},
          {"id": 2, "type": "beacon", "beaconId": "Indooro2", "beaconUUID": "B5CAA23B-BB89-4040-99D2-FCED3EA4A62B",
           "beaconMajor": 1, "beaconMinor": 2, "x": 3, "y": 3}
        ]}
        """
        let layout = try JSONDecoder().decode(LayoutData.self, from: Data(json.utf8))
        let mapper = EngineSampleMapper(catalog: PositioningLayout(layout: layout, revision: 1).beacons)
        func record(_ beacon: String, _ source: MeasurementSourceKind) -> MeasurementRecord {
            MeasurementRecord(t: 1, source: source, beacon: beacon, rssi: -70, accuracy: 3, proximity: .near, txPower: nil)
        }
        guard case .unmapped = mapper.sample(for: record("Dock-A", .rssi)) else { return XCTFail("advertisement without UUID must be unmapped") }
        guard case .sample = mapper.sample(for: record("Indooro2", .rssi)) else { return XCTFail("complete identity must map") }
        guard case .sample = mapper.sample(for: record("Indooro2", .ranging)) else { return XCTFail("ranging must map") }
        guard case .skipped = mapper.sample(for: record("Unknown", .ranging)) else { return XCTFail("unknown beacon is skipped") }
        var zero = record("Indooro2", .rssi)
        zero.rssi = 127
        guard case .skipped = mapper.sample(for: zero) else { return XCTFail("RSSI 127 is dropped by the radio layer") }
    }

    func testWarmupTicksProduceNoEpochs() async throws {
        let result = try await ComparisonFixtures.run()
        let first = try XCTUnwrap(result.epochs.first)
        let plan = ReplayPlan(recording: try NavigationRecordLine.parse(jsonl: ComparisonFixtures.recordingText()), config: .default)
        XCTAssertGreaterThanOrEqual(first.t - plan.start, StabilizedNavigationConfig.default.beacon.warmupSeconds)
        let noWarmup = try await ComparisonFixtures.run(warmupSeconds: 0)
        XCTAssertGreaterThan(noWarmup.epochCount, result.epochCount)
    }
}
