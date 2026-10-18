import Foundation
import IndooroModels
import IndooroNavigation
import IndooroTestSupport
import XCTest
import simd
@testable import IndooroPositioning

let testBeaconUUID = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!

/// Offene 12 m x 12 m Flaeche mit vier Beacons in den Ecken (alle < `maxDistanceMeters` vom Zentrum) (kein Regal, jeder Punkt begehbar).
func makeOpenLayout() throws -> LayoutData {
    try JSONDecoder().decode(LayoutData.self, from: openLayoutJSON())
}

func openLayoutJSON() -> Data {
    let beacons: [(Int, Double, Double)] = [(1, 1, 1), (2, 11, 1), (3, 1, 11), (4, 11, 11)]
    let elements = beacons.map { id, x, y in
        """
        {"id": \(id), "type": "beacon", "beaconId": "TEST-\(id)", "beaconUUID": "\(testBeaconUUID.uuidString)",
         "beaconMajor": 1, "beaconMinor": \(id), "x": \(x), "y": \(y)}
        """
    }
    let json = """
    {"shopName": "Test", "gridSize": {"width": 12, "height": 12}, "elements": [\(elements.joined(separator: ","))]}
    """
    return Data(json.utf8)
}

func makeIdentity(minor: UInt16) -> BeaconIdentity {
    BeaconIdentity(uuid: testBeaconUUID, major: 1, minor: minor)
}

/// Ranging-Samples aller vier Beacons zu einem Wahrheitspunkt.
func rangingSamples(truth: SIMD2<Float>, at timestamp: TimeInterval, layout: LayoutData, skip: Set<UInt16> = []) -> [BeaconSample] {
    layout.elements.compactMap { element in
        guard let minor = element.beaconMinor.map({ UInt16($0) }), !skip.contains(minor) else { return nil }
        let distance = simd_length(SIMD2<Float>(Float(element.x), Float(element.y)) - truth)
        return BeaconSample(
            source: .ranging(accuracy: Double(distance), proximity: distance < 3 ? .near : .far),
            rssi: -60 - Int(distance * 2),
            timestamp: timestamp,
            identity: makeIdentity(minor: minor)
        )
    }
}

struct EngineRig {
    let engine: PositioningEngine
    let radio: FakeBeaconRadio
    let clock: TestClock
    let layout: LayoutData
    let config: StabilizedNavigationConfig

    init(
        headings: HeadingProvider? = nil,
        motion: MotionProvider? = nil,
        config: StabilizedNavigationConfig = .default
    ) throws {
        self.config = config
        radio = FakeBeaconRadio()
        clock = TestClock()
        layout = try makeOpenLayout()
        engine = PositioningEngine(radio: radio, headingProvider: headings, motionProvider: motion, clock: clock, config: config)
    }

    func prepare() async {
        await engine.setLayout(PositioningLayout(layout: layout, revision: 1))
        await engine.start()
    }

    /// Speist Ranging-Samples fuer `truth` zum aktuellen Uhrzeitpunkt ein.
    func feed(truth: SIMD2<Float>, skip: Set<UInt16> = []) async {
        for sample in rangingSamples(truth: truth, at: clock.now(), layout: layout, skip: skip) {
            await engine.ingest(sample)
        }
    }

    /// Ein Tick: Proben einspeisen, eine Tick-Periode vorstellen, Snapshot lesen.
    @discardableResult
    func tick(truth: SIMD2<Float>?, skip: Set<UInt16> = []) async -> PositionSnapshot? {
        if let truth { await feed(truth: truth, skip: skip) }
        await clock.advance(by: config.beacon.updateIntervalSeconds)
        return await engine.latestSnapshot
    }

    /// Laeuft die Aufwaermphase durch (Warm-up + eine Tick-Periode Spiel).
    func finishWarmup(truth: SIMD2<Float>) async {
        var snapshot: PositionSnapshot?
        for _ in 0..<12 {
            snapshot = await tick(truth: truth)
            if snapshot?.status != .warmingUp { break }
        }
    }
}

struct NoSnapshotError: Error {}

extension EngineRig {
    func latest() async throws -> PositionSnapshot {
        guard let snapshot = await engine.latestSnapshot else {
            throw NoSnapshotError()
        }
        return snapshot
    }

    func requireTick(truth: SIMD2<Float>?, skip: Set<UInt16> = []) async throws -> PositionSnapshot {
        guard let snapshot = await tick(truth: truth, skip: skip) else {
            throw NoSnapshotError()
        }
        return snapshot
    }
}
