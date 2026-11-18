import IndooroModels
import XCTest
import simd
@testable import IndooroNavigation
@testable import IndooroPositioning

/// Task 9.6: Die Engine liefert tick fuer tick dieselben Werte wie `NavigationReplay` (die Kette, die auch die
/// Replay-Fixtures pruefen). Eine Aufzeichnung mit Gehstrecke, Rauschen, Ausreisser und Funkloch laeuft durch
/// beide Wege; Position, Rohpunkt, Konfidenz und Zahl aktiver Messungen muessen uebereinstimmen.
final class ReplayAgreementTests: XCTestCase {
    private let start: TimeInterval = 1_000

    private struct Generator {
        var state: UInt64 = 7
        mutating func unit() -> Double {
            state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            return Double(state >> 11) / Double(1 << 53)
        }
    }

    private func truth(at time: Double) -> SIMD2<Float> {
        let travelled = Float(max(0, time) * 0.8)
        if travelled <= 6 { return SIMD2(3 + travelled, 3) }
        return SIMD2(9, 3 + min(travelled - 6, 6))
    }

    private func recording(layout: LayoutData) -> [NavigationRecordLine] {
        var generator = Generator()
        var lines: [NavigationRecordLine] = []
        var time = 0.0
        while time <= 20 {
            defer { time += 0.1 }
            if time >= 12, time < 16 { continue } // Funkloch
            let position = truth(at: time)
            for element in layout.elements where element.type == "beacon" {
                let anchor = SIMD2<Float>(Float(element.x), Float(element.y))
                var distance = Double(simd_length(anchor - position))
                distance *= 1 + 0.08 * (generator.unit() - 0.5)
                if time >= 8, time < 8.6, element.beaconMinor == 2 { distance += 6 } // Ausreisser
                lines.append(.measurement(MeasurementRecord(
                    t: start + time,
                    source: .ranging,
                    beacon: element.beaconId ?? "",
                    rssi: -55 - Int(distance * 2),
                    accuracy: distance,
                    proximity: distance < 2 ? .immediate : (distance < 5 ? .near : .far)
                )))
            }
        }
        return lines
    }

    func testEngineMatchesNavigationReplayTickForTick() async throws {
        let layout = try makeOpenLayout()
        var config = StabilizedNavigationConfig.default
        config.beacon.warmupSeconds = 0
        let lines = recording(layout: layout)

        var replayTicks: [ReplayTick] = []
        _ = NavigationReplay.run(recording: lines, layout: layout, config: config) { replayTicks.append($0) }
        XCTAssertGreaterThan(replayTicks.count, 40)
        // Die Aufzeichnung deckt Positionen und das Funkloch ab (sonst waere der Vergleich leer).
        XCTAssertGreaterThan(replayTicks.filter { $0.projected != nil }.count, 20)
        XCTAssertGreaterThan(replayTicks.filter { $0.projected == nil }.count, 3)

        let rig = try EngineRig(config: config)
        await rig.prepare()
        var index = 0
        var tickTime = start
        var compared = 0
        for expected in replayTicks {
            tickTime += config.beacon.updateIntervalSeconds
            while index < lines.count, lines[index].timestamp <= tickTime {
                if case let .measurement(record) = lines[index] {
                    await rig.engine.ingest(BeaconSample(
                        source: .ranging(accuracy: record.accuracy ?? 0, proximity: record.proximity ?? .unknown),
                        rssi: record.rssi,
                        timestamp: record.t,
                        identity: makeIdentity(minor: UInt16(record.beacon.dropFirst("TEST-".count)) ?? 0)
                    ))
                }
                index += 1
            }
            await rig.clock.advance(by: config.beacon.updateIntervalSeconds)
            let snapshot = try await rig.latest()

            XCTAssertEqual(snapshot.timestamp, expected.t, accuracy: 1e-9)
            XCTAssertEqual(snapshot.displayedPoint, expected.projected, "projizierte Position bei t=\(expected.t)")
            XCTAssertEqual(snapshot.rawPoint, expected.solved, "Rohpunkt bei t=\(expected.t)")
            XCTAssertEqual(snapshot.activeBeaconCount, expected.beaconsUsed, "Messungen bei t=\(expected.t)")
            if expected.solved != nil {
                XCTAssertEqual(snapshot.confidence, expected.confidence, accuracy: 1e-6)
            }
            let expectedTrust = expected.projected != nil && expected.confidence >= config.confidence.lowThreshold
            XCTAssertEqual(snapshot.isTrusted, expectedTrust, "Vertrauen bei t=\(expected.t)")
            compared += 1
        }
        XCTAssertEqual(compared, replayTicks.count)
        await rig.engine.stop()
    }
}
