import XCTest
import simd
@testable import IndooroNavigationCore

/// Spec "Displayed position suppresses implausible jumps" und
/// "Position estimate is smoothed without speed caps" (Task 6.10).
final class PoseEstimatorTests: XCTestCase {
    private let tick = 0.35

    private func report(_ key: String, _ value: Double) {
        print("AFTER56 \(key)=\(String(format: "%.3f", value))")
    }

    private func makeService() -> PoseFusionService {
        PoseFusionService(config: StabilizedNavigationConfig.default.poseFusion)
    }

    // MARK: - Jump gate

    func testSingleOutlierIsNeverAccepted() {
        let service = makeService()
        var time = 0.0
        _ = service.update(solvedPoint: SIMD2<Float>(5, 5), confidence: 1, timestamp: time)

        time += tick
        let outlier = service.update(solvedPoint: SIMD2<Float>(15, 5), confidence: 1, timestamp: time)
        XCTAssertEqual(outlier?.wasHeld, true)
        XCTAssertEqual(outlier?.point.x ?? 0, 5, accuracy: 1e-4)

        for _ in 0..<10 {
            time += tick
            let next = service.update(solvedPoint: SIMD2<Float>(5, 5), confidence: 1, timestamp: time)
            XCTAssertEqual(next?.wasHeld, false)
            XCTAssertEqual(next?.point.x ?? 0, 5, accuracy: 1e-4, "Schaetzer darf nie Richtung 15 m wandern")
        }
    }

    func testConfirmedRelocationAfterThreeClusteredPoints() {
        let service = makeService()
        var time = 0.0
        _ = service.update(solvedPoint: SIMD2<Float>(5, 5), confidence: 1, timestamp: time)

        let cluster: [SIMD2<Float>] = [SIMD2<Float>(15, 5), SIMD2<Float>(15.5, 5.3), SIMD2<Float>(14.7, 4.8)]
        var results: [PoseEstimate] = []
        for point in cluster {
            time += tick
            if let result = service.update(solvedPoint: point, confidence: 1, timestamp: time) {
                results.append(result)
            }
        }
        XCTAssertEqual(results.map(\.wasHeld), [true, true, false])
        XCTAssertEqual(results[1].point.x, 5, accuracy: 1e-4)
        XCTAssertGreaterThan(results[2].point.x, 10, "dritter Punkt wird akzeptiert, Schaetzer bewegt sich Richtung 15 m")

        // Folgepunkte bei 15 m werden nicht erneut gehalten.
        time += tick
        let follow = service.update(solvedPoint: SIMD2<Float>(15, 5), confidence: 1, timestamp: time)
        XCTAssertEqual(follow?.wasHeld, false)
    }

    func testScatteredOutliersDoNotConfirm() {
        let service = makeService()
        var time = 0.0
        _ = service.update(solvedPoint: SIMD2<Float>(5, 5), confidence: 1, timestamp: time)
        for point in [SIMD2<Float>(15, 5), SIMD2<Float>(5, 15), SIMD2<Float>(25, 25)] {
            time += tick
            let result = service.update(solvedPoint: point, confidence: 1, timestamp: time)
            XCTAssertEqual(result?.wasHeld, true)
            XCTAssertEqual(result?.point.x ?? 0, 5, accuracy: 1e-4)
        }
    }

    func testWalkingFortyFiveCentimetersPerTickIsNeverHeld() {
        let service = makeService()
        var held = 0
        var time = 0.0
        for index in 0..<120 {
            let point = SIMD2<Float>(5 + 0.45 * Float(index), 5)
            if service.update(solvedPoint: point, confidence: 0.6, timestamp: time)?.wasHeld == true {
                held += 1
            }
            time += tick
        }
        XCTAssertEqual(held, 0)
    }

    func testGateUsesTimeSinceLastAcceptedPoint() {
        let service = makeService()
        _ = service.update(solvedPoint: SIMD2<Float>(5, 5), confidence: 1, timestamp: 0)
        // 3 m nach 0.35 s: ueber 2.5 * 0.35 + 0.85 = 1.725 m -> gehalten.
        XCTAssertEqual(service.update(solvedPoint: SIMD2<Float>(8, 5), confidence: 1, timestamp: 0.35)?.wasHeld, true)
        // Nach 2.0 s ohne akzeptierten Punkt sind 2.5 * 2.0 + 0.85 = 5.85 m erlaubt (einzelner, neuer Cluster).
        XCTAssertEqual(service.update(solvedPoint: SIMD2<Float>(8, 5), confidence: 1, timestamp: 2.0)?.wasHeld, false)
    }

    func testResetClearsJumpCandidates() {
        let service = makeService()
        var time = 0.0
        _ = service.update(solvedPoint: SIMD2<Float>(5, 5), confidence: 1, timestamp: time)
        for _ in 0..<2 {
            time += tick
            _ = service.update(solvedPoint: SIMD2<Float>(15, 5), confidence: 1, timestamp: time)
        }
        service.reset(to: SIMD2<Float>(5, 5), timestamp: time)
        time += tick
        // Ohne Reset waere dies der dritte bestaetigende Punkt.
        let result = service.update(solvedPoint: SIMD2<Float>(15, 5), confidence: 1, timestamp: time)
        XCTAssertEqual(result?.wasHeld, true)
        XCTAssertEqual(result?.point.x ?? 0, 5, accuracy: 1e-4)
    }

    // MARK: - Smoothing

    private func lag(speed: Float, confidence: Float, duration: TimeInterval) -> Float {
        let service = makeService()
        var time = 0.0
        var truth = SIMD2<Float>(5, 5)
        var estimate = truth
        while time <= duration + 1e-9 {
            truth = SIMD2<Float>(5, 5 + speed * Float(time))
            estimate = service.update(solvedPoint: truth, confidence: confidence, timestamp: time)?.point ?? estimate
            time += tick
        }
        return simd_length(truth - estimate)
    }

    func testLagAtWalkingSpeedWithFullConfidenceIsBelowOneMeter() {
        let lag10 = lag(speed: 1.2, confidence: 0.7, duration: 10)
        let lag13 = lag(speed: 1.3, confidence: 1.0, duration: 20)
        let lag13half = lag(speed: 1.3, confidence: 0.5, duration: 20)
        let lag13low = lag(speed: 1.3, confidence: 0.2, duration: 20)
        report("posefusion.lag10s_1.2mps_conf0.7_m", Double(lag10))
        report("posefusion.lag20s_1.3mps_conf1.0_m", Double(lag13))
        report("posefusion.lag20s_1.3mps_conf0.5_m", Double(lag13half))
        report("posefusion.lag20s_1.3mps_conf0.2_m", Double(lag13low))
        XCTAssertLessThan(lag13, 1.0)
        // Lag waechst mit sinkender Konfidenz, bleibt aber beschraenkt (v * dt * (1 - a) / a).
        // Bei sehr niedriger Konfidenz ueberschreitet Lag + v * dt das Sprung-Gate; die
        // Folgepunkte werden gehalten und nach 3 Bestaetigungen uebernommen (Sagezahn),
        // daher keine strikte Monotonie unterhalb von Konfidenz 0.5.
        XCTAssertLessThan(lag13, lag13half)
        XCTAssertLessThan(lag13half, 1.5)
        XCTAssertLessThan(lag13low, 2.1)
    }

    func testSmoothingIsPlainEMAWithoutSpeedScaling() {
        let service = makeService()
        _ = service.update(solvedPoint: SIMD2<Float>(0, 0), confidence: 1, timestamp: 0)
        // 1.5 m in 0.35 s liegen innerhalb des Gates (1.725 m): alpha = 0.46 ohne Geschwindigkeitsdivision.
        let result = service.update(solvedPoint: SIMD2<Float>(1.5, 0), confidence: 1, timestamp: 0.35)
        XCTAssertEqual(result?.point.x ?? 0, 1.5 * 0.46, accuracy: 1e-5)
        let zeroConfidence = makeService()
        _ = zeroConfidence.update(solvedPoint: SIMD2<Float>(0, 0), confidence: 0, timestamp: 0)
        let low = zeroConfidence.update(solvedPoint: SIMD2<Float>(1.5, 0), confidence: 0, timestamp: 0.35)
        XCTAssertEqual(low?.point.x ?? 0, 1.5 * 0.18, accuracy: 1e-5)
    }

    func testStationaryJitterIsSmoothedAndEstimateIsStableBetweenTicks() {
        var rng = SplitMix64(seed: 42)
        let service = makeService()
        let center = SIMD2<Float>(20, 20)
        var previousRaw: SIMD2<Float>?
        var previous: SIMD2<Float>?
        var rawPath: Float = 0
        var estimatePath: Float = 0
        var time = 0.0
        while time <= 27 {
            let noisy = center + SIMD2<Float>(
                Float(rng.nextGaussian(sigma: 1)),
                Float(rng.nextGaussian(sigma: 1))
            )
            let estimate = service.update(solvedPoint: noisy, confidence: 0.7, timestamp: time)?.point ?? center
            if let previousRaw { rawPath += simd_length(noisy - previousRaw) }
            if let previous { estimatePath += simd_length(estimate - previous) }
            previousRaw = noisy
            previous = estimate
            time += tick
        }
        report("posefusion.stationary27s_sigma1.path.raw_m", Double(rawPath))
        report("posefusion.stationary27s_sigma1.path.estimate_m", Double(estimatePath))
        XCTAssertLessThan(estimatePath, rawPath * 0.8)

        // Ohne Tick aendert sich der Schaetzwert nicht (keine Prediction).
        let snapshot = service.estimate
        for _ in 0..<1000 { _ = service.estimate }
        XCTAssertEqual(service.estimate, snapshot)
    }

    func testNonFinitePointIsIgnored() {
        let service = makeService()
        _ = service.update(solvedPoint: SIMD2<Float>(5, 5), confidence: 1, timestamp: 0)
        let result = service.update(solvedPoint: SIMD2<Float>(.nan, 5), confidence: 1, timestamp: 0.35)
        XCTAssertEqual(result?.point.x ?? 0, 5, accuracy: 1e-5)
        XCTAssertNil(makeService().update(solvedPoint: SIMD2<Float>(.nan, 5), confidence: 1, timestamp: 0))
    }
}
