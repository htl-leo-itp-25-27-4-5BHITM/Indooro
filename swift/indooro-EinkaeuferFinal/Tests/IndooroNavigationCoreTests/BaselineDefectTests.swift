import XCTest
import simd
@testable import IndooroNavigationCore

/// Baseline-Tests (Task 2.5): Jeder Test dokumentiert einen BEKANNTEN DEFEKT des
/// aktuellen Verhaltens (docs/NAVIGATION_REVIEW.md C.1-C.13) und besteht, solange
/// der Defekt existiert. Die Zahlen werden mit `BASELINE key=value` ausgegeben und
/// stehen in NavigationFixtures/BASELINE.md. Die Assertions werden in den
/// Tasks 6.10 / 8.6 / 9.10 invertiert.
final class BaselineDefectTests: XCTestCase {
    private let tick = 0.35

    private func report(_ key: String, _ value: Double) {
        print("BASELINE \(key)=\(String(format: "%.3f", value))")
    }

    // MARK: - PoseFusion lag

    /// Laeuft `duration` Sekunden mit `speed` geradeaus und liefert den Abstand
    /// Wahrheit <-> fusionierte Pose am Ende.
    private func poseFusionLag(
        duration: TimeInterval,
        speed: Float,
        confidence: Float,
        withPredict: Bool
    ) -> Float {
        let service = PoseFusionService(config: StabilizedNavigationConfig.default.poseFusion)
        let start = SIMD2<Float>(5, 5)
        let direction = SIMD2<Float>(0, 1)
        var lastPose: FusedPose?
        var time = 0.0
        while time <= duration + 1e-9 {
            let truth = start + direction * speed * Float(time)
            lastPose = service.update(
                rawPose: RawPoseSample(
                    mapPoint: truth,
                    headingRadians: 0,
                    confidence: confidence,
                    timestamp: time,
                    source: .ble
                ),
                radioFix: nil
            )
            if withPredict {
                // 20 Hz Prediction zwischen den Ticks (wie der Motion-Handler der App).
                var predictTime = time + 0.05
                while predictTime < time + tick - 1e-9, predictTime <= duration {
                    lastPose = service.predict(to: predictTime, headingRadians: 0, motionIntensityG: 0.1) ?? lastPose
                    predictTime += 0.05
                }
            }
            time += tick
        }
        let endTime = time - tick
        let truthEnd = start + direction * speed * Float(endTime)
        return simd_length(truthEnd - (lastPose?.mapPoint ?? .zero))
    }

    func testBaseline_poseFusionLagAt1p2MetersPerSecond() {
        let without = poseFusionLag(duration: 10, speed: 1.2, confidence: 0.7, withPredict: false)
        let with = poseFusionLag(duration: 10, speed: 1.2, confidence: 0.7, withPredict: true)
        report("posefusion.lag10s_1.2mps_conf0.7.noPredict_m", Double(without))
        report("posefusion.lag10s_1.2mps_conf0.7.predict20Hz_m", Double(with))
        // Defekt C.1: ohne Prediction >3 m Nachlauf; Prediction versteckt ihn nur.
        // Inverted in task 6.10
        XCTAssertGreaterThan(without, 3.0)
        XCTAssertLessThan(with, without)
    }

    func testBaseline_poseFusionLagGrowsAsConfidenceDrops() {
        let lags = [Float(1.0), 0.5, 0.2].map {
            poseFusionLag(duration: 20, speed: 1.3, confidence: $0, withPredict: false)
        }
        report("posefusion.lag20s_1.3mps_conf1.0_m", Double(lags[0]))
        report("posefusion.lag20s_1.3mps_conf0.5_m", Double(lags[1]))
        report("posefusion.lag20s_1.3mps_conf0.2_m", Double(lags[2]))
        // Defekt C.1: selbst bei Konfidenz 1.0 >3 m Nachlauf, wachsend mit sinkender Konfidenz.
        // Inverted in task 6.10
        XCTAssertGreaterThan(lags[0], 3.0)
        XCTAssertGreaterThan(lags[1], lags[0])
        XCTAssertGreaterThan(lags[2], lags[1])
    }

    func testBaseline_poseFusionStationaryJitterAmplifiedByPredict() {
        func pathLength(withPredict: Bool) -> Float {
            var rng = SplitMix64(seed: 42)
            let service = PoseFusionService(config: StabilizedNavigationConfig.default.poseFusion)
            let center = SIMD2<Float>(20, 20)
            var previous: SIMD2<Float>?
            var path: Float = 0
            func record(_ point: SIMD2<Float>) {
                if let previous { path += simd_length(point - previous) }
                previous = point
            }
            var time = 0.0
            while time <= 27 {
                let noisy = center + SIMD2<Float>(
                    Float(rng.nextGaussian(sigma: 1)),
                    Float(rng.nextGaussian(sigma: 1))
                )
                let fused = service.update(
                    rawPose: RawPoseSample(mapPoint: noisy, headingRadians: nil, confidence: 0.7, timestamp: time, source: .ble),
                    radioFix: nil
                )
                record(fused.mapPoint)
                if withPredict {
                    var predictTime = time + 0.05
                    while predictTime < time + tick - 1e-9 {
                        if let predicted = service.predict(to: predictTime, headingRadians: nil, motionIntensityG: 0.1) {
                            record(predicted.mapPoint)
                        }
                        predictTime += 0.05
                    }
                }
                time += tick
            }
            return path
        }

        let without = pathLength(withPredict: false)
        let with = pathLength(withPredict: true)
        report("posefusion.stationary27s_sigma1.path.noPredict_m", Double(without))
        report("posefusion.stationary27s_sigma1.path.predict20Hz_m", Double(with))
        report("posefusion.stationary27s_sigma1.path.ratio", Double(with / max(without, 0.001)))
        // Defekt C.1: 20-Hz-Prediction vergroessert den Jitter im Stand um ein Vielfaches.
        // Inverted in task 6.10
        XCTAssertGreaterThan(with / max(without, 0.001), 2.0)
    }

    // MARK: - MapMatcher

    private func makeMatcherEnvironment() throws -> (graph: IndoorGraph, matcher: MapMatcher) {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let graph = TestLayouts.demoGraph(layout: layout)
        return (graph, MapMatcher(graph: graph, config: StabilizedNavigationConfig.default.mapMatcher))
    }

    private func pose(_ point: SIMD2<Float>, heading: Float? = nil, at time: TimeInterval = 0) -> FusedPose {
        FusedPose(
            mapPoint: point,
            headingRadians: heading,
            confidence: 1,
            velocityMetersPerSecond: .zero,
            timestamp: time
        )
    }

    func testBaseline_mapMatcherJumpLockStaysAtOldPosition() throws {
        for jump in [2.0, 4.0, 8.0, 20.0] {
            let (_, matcher) = try makeMatcherEnvironment()
            // Zuerst im Gang x = 14.5 (offener Bereich y = 5...10) einrasten.
            let origin = SIMD2<Float>(14.5, 7.5)
            for index in 0..<5 {
                _ = matcher.match(pose: pose(origin, at: Double(index) * tick), preferredRouteEdgeIDs: [])
            }
            // Dann bleibt die Rohposition dauerhaft `jump` Meter weiter in +x.
            let moved = origin + SIMD2<Float>(Float(jump), 0)
            var snapped: SIMD2<Float> = origin
            for index in 0..<20 {
                snapped = matcher.match(pose: pose(moved, at: Double(5 + index) * tick), preferredRouteEdgeIDs: [])?
                    .snappedPosition ?? snapped
            }
            let shift = snapped.x - origin.x
            report("mapmatcher.jump\(Int(jump))m.snappedShiftX_m", Double(shift))
            // Defekt C.2: Der Matcher haengt am alten Segment, der Sprung wird nie uebernommen
            // (Verschiebung hoechstens die Haelfte des Sprungs; Tie-Breaks in Graph/A*
            // haengen von der Hash-Reihenfolge ab, daher kein exakter Wert).
            // Inverted in task 6.10
            XCTAssertLessThanOrEqual(shift, Float(jump) * 0.5, "Sprung \(jump) m wurde uebernommen")
        }
    }

    func testBaseline_mapMatcherAisleChangeThroughShelfStaysInOldAisle() throws {
        // Regal 525/1 (x 29...38, y 56...59, horizontal 9x3): oberhalb Gang y < 56, darunter y = 59.5.
        let (_, matcher) = try makeMatcherEnvironment()
        let oldAisle = SIMD2<Float>(33.5, 55.5)
        for index in 0..<5 {
            _ = matcher.match(pose: pose(oldAisle, at: Double(index) * tick), preferredRouteEdgeIDs: [])
        }
        let newAisle = SIMD2<Float>(33.5, 59.5)
        var snapped = oldAisle
        for index in 0..<20 {
            snapped = matcher.match(pose: pose(newAisle, at: Double(5 + index) * tick), preferredRouteEdgeIDs: [])?
                .snappedPosition ?? snapped
        }
        report("mapmatcher.aisleChange.snappedY_m", Double(snapped.y))
        // Defekt C.2: Rohposition liegt 4 m weiter im neuen Gang, Snap bleibt im alten (y < 56).
        // Inverted in task 6.10
        XCTAssertLessThan(snapped.y, 56)
    }

    func testBaseline_mapMatcherHeadingBiasesSnapAxis() throws {
        // Punkt mit gleichem Abstand (0.3 m) zu einer horizontalen und einer vertikalen Kante.
        let tiePoint = SIMD2<Float>(20.8, 8.8)
        let (_, leftMatcher) = try makeMatcherEnvironment()
        let (_, rightMatcher) = try makeMatcherEnvironment()
        let walkingLeft = leftMatcher.match(pose: pose(tiePoint, heading: -.pi / 2), preferredRouteEdgeIDs: [])
        let walkingRight = rightMatcher.match(pose: pose(tiePoint, heading: .pi / 2), preferredRouteEdgeIDs: [])

        func isHorizontal(_ match: MapMatchedPose?) -> Bool {
            guard let match else { return false }
            return abs(match.snappedPosition.y - 8.5) < 0.001 // y liegt auf der Zeilenmitte
        }
        report("mapmatcher.heading.leftSnapsHorizontal", isHorizontal(walkingLeft) ? 1 : 0)
        report("mapmatcher.heading.rightSnapsHorizontal", isHorizontal(walkingRight) ? 1 : 0)
        // Defekt C.2: Heading-Score ignoriert Kantenrichtung - Gehen nach links (-x) rastet
        // auf der vertikalen Kante ein, Gehen nach rechts (+x) auf der horizontalen.
        // Inverted in task 6.10
        XCTAssertFalse(isHorizontal(walkingLeft))
        XCTAssertTrue(isHorizontal(walkingRight))
    }

    // MARK: - Routing

    func testBaseline_routeShapeVariesForStartsWithinFortyCentimeters() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let graph = TestLayouts.demoGraph(layout: layout)
        var rng = SplitMix64(seed: 7)
        let destination = SIMD2<Float>(26.5, 4.5)
        var sequences = Set<[Int]>()
        for _ in 0..<40 {
            let start = SIMD2<Float>(
                20 + Float(rng.nextUnit() * 0.8 - 0.4),
                8 + Float(rng.nextUnit() * 0.8 - 0.4)
            )
            if let route = graph.shortestRoute(from: start, to: destination) {
                sequences.insert(route.edgeIDs)
            }
        }
        report("routing.distinctEdgeSequencesFor40Starts", Double(sequences.count))
        // Defekt C.9/C.10: kleine Startverschiebungen erzeugen unterschiedliche Routenformen.
        // Inverted in task 8.6
        XCTAssertGreaterThan(sequences.count, 1)
    }

    func testBaseline_nearestNeighbourFirstStopFlipsWithJitter() throws {
        let layout = try TestLayouts.demoSupermarket(beaconSpacing: nil)
        let graph = TestLayouts.demoGraph(layout: layout)
        // Zwei Stopps symmetrisch (je 6 m) um den Startpunkt im offenen Gang y = 8.5.
        let stops = [SIMD2<Float>(14.5, 8.5), SIMD2<Float>(26.5, 8.5)]
        let center = SIMD2<Float>(20.5, 8.5)
        var rng = SplitMix64(seed: 11)
        var firstStops = Set<Int>()
        for _ in 0..<60 {
            let angle = Float(rng.nextUnit() * 2 * Double.pi)
            let radius = Float(rng.nextUnit()) * 0.85
            let start = center + SIMD2<Float>(cos(angle), sin(angle)) * radius
            // Nearest-Neighbour wie MultiStopRoutePlanner.order: kleinste Routenkosten gewinnt.
            let costs = stops.map { graph.plannedRouteCost(from: start, to: $0) }
            firstStops.insert(costs[0] <= costs[1] ? 0 : 1)
        }
        report("routing.nearestNeighbour.distinctFirstStops", Double(firstStops.count))
        // Defekt C.10: Jitter <= 0.85 m kippt den ersten Stopp.
        // Inverted in task 9.10
        XCTAssertEqual(firstStops.count, 2)
    }
}
